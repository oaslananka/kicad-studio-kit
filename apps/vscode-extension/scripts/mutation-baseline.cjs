const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const REQUIRED_REPORTERS = ['clear-text', 'html', 'json', 'progress'];
const SCORE_EPSILON = 0.0001;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function compareStrings(left, right) {
  return left.localeCompare(right);
}

function sortedStrings(values) {
  return [...values].sort(compareStrings);
}

function sameStringSet(left, right) {
  return (
    JSON.stringify(sortedStrings(left ?? [])) ===
    JSON.stringify(sortedStrings(right ?? []))
  );
}

function countStatuses(mutants) {
  const counts = {
    mutants: mutants.length,
    killed: 0,
    timeout: 0,
    survived: 0,
    noCoverage: 0,
    errors: 0
  };
  for (const mutant of mutants) {
    switch (mutant.status) {
      case 'Killed':
        counts.killed += 1;
        break;
      case 'Timeout':
        counts.timeout += 1;
        break;
      case 'Survived':
        counts.survived += 1;
        break;
      case 'NoCoverage':
        counts.noCoverage += 1;
        break;
      default:
        counts.errors += 1;
    }
  }
  const denominator =
    counts.killed + counts.timeout + counts.survived + counts.noCoverage;
  counts.score =
    denominator === 0
      ? 100
      : Number(
          ((100 * (counts.killed + counts.timeout)) / denominator).toFixed(4)
        );
  return counts;
}

function survivorFingerprint(file, mutant) {
  return JSON.stringify({
    file,
    id: String(mutant.id),
    mutatorName: mutant.mutatorName,
    replacement: mutant.replacement,
    static: Boolean(mutant.static),
    location: mutant.location
  });
}

function loadPolicy(extensionRoot) {
  return {
    config: readJson(path.join(extensionRoot, 'stryker.config.json')),
    baseline: readJson(path.join(extensionRoot, 'mutation-baseline.json'))
  };
}

function validateExistingPaths(extensionRoot, paths, label, errors) {
  for (const relativePath of paths) {
    if (!fs.existsSync(path.join(extensionRoot, relativePath))) {
      errors.push(`${label} references missing path ${relativePath}`);
    }
  }
}

function pushWhenInvalid(errors, condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function validateStrykerConfiguration(config, baseline, errors) {
  pushWhenInvalid(
    errors,
    config.testRunner === 'jest' && config.coverageAnalysis === 'perTest',
    'Stryker must use the Jest runner with perTest coverage analysis'
  );
  pushWhenInvalid(
    errors,
    sameStringSet(config.plugins, ['@stryker-mutator/jest-runner']),
    'Stryker must explicitly load @stryker-mutator/jest-runner'
  );
  for (const reporter of REQUIRED_REPORTERS) {
    pushWhenInvalid(
      errors,
      config.reporters?.includes(reporter),
      `Stryker reporters must include ${reporter}`
    );
  }
  pushWhenInvalid(
    errors,
    config.jsonReporter?.fileName === 'reports/mutation/mutation.json',
    'Stryker JSON report must be reports/mutation/mutation.json'
  );
  pushWhenInvalid(
    errors,
    config.cleanTempDir === 'always',
    'Stryker cleanTempDir must be always'
  );
  pushWhenInvalid(
    errors,
    config.concurrency === 2,
    'Stryker concurrency must remain 2 for deterministic CI resource use'
  );
  pushWhenInvalid(
    errors,
    config.thresholds?.break === baseline.minimumScore,
    `Stryker break threshold ${config.thresholds?.break} must equal baseline ${baseline.minimumScore}`
  );
  pushWhenInvalid(
    errors,
    sameStringSet(config.mutate, baseline.scope?.mutate),
    'Stryker mutate scope must match mutation-baseline.json'
  );
  pushWhenInvalid(
    errors,
    sameStringSet(config.testFiles, baseline.scope?.testFiles),
    'Stryker testFiles scope must match mutation-baseline.json'
  );
}

function validateBaselineStructure(extensionRoot, baseline, errors) {
  const baselineFiles = Object.keys(baseline.files ?? {});
  const fileMutantTotal = Object.values(baseline.files ?? {}).reduce(
    (sum, file) => sum + Number(file.minimumMutants ?? 0),
    0
  );
  pushWhenInvalid(
    errors,
    baseline.schemaVersion === 1,
    'mutation-baseline.json schemaVersion must be 1'
  );
  pushWhenInvalid(
    errors,
    sameStringSet(baselineFiles, baseline.scope?.mutate ?? []),
    'mutation-baseline.json file baselines must match the mutate scope'
  );
  pushWhenInvalid(
    errors,
    fileMutantTotal === baseline.scope?.minimumMutants,
    'mutation baseline file mutant counts must sum to scope.minimumMutants'
  );
  pushWhenInvalid(
    errors,
    baseline.measured?.mutants === baseline.scope?.minimumMutants,
    'measured mutant count must equal scope.minimumMutants'
  );
  pushWhenInvalid(
    errors,
    baseline.measured?.score >= baseline.minimumScore,
    'measured mutation score must satisfy minimumScore'
  );
  pushWhenInvalid(
    errors,
    Number.isInteger(baseline.scope?.ciBudgetMinutes) &&
      baseline.scope.ciBudgetMinutes >= 1,
    'mutation scope must declare a positive integer CI budget'
  );
  validateExistingPaths(
    extensionRoot,
    baseline.scope?.mutate ?? [],
    'mutation scope',
    errors
  );
  validateExistingPaths(
    extensionRoot,
    baseline.scope?.testFiles ?? [],
    'mutation tests',
    errors
  );
  return baselineFiles;
}

function validateAllowedSurvivors(
  extensionRoot,
  baseline,
  baselineFiles,
  errors
) {
  const fingerprints = new Set();
  for (const survivor of baseline.allowedSurvivors ?? []) {
    const fingerprint = survivorFingerprint(survivor.file, survivor);
    pushWhenInvalid(
      errors,
      !fingerprints.has(fingerprint),
      `duplicate allowed survivor ${survivor.file}#${survivor.id}`
    );
    fingerprints.add(fingerprint);
    pushWhenInvalid(
      errors,
      baselineFiles.includes(survivor.file),
      `allowed survivor is outside mutation scope: ${survivor.file}`
    );
    pushWhenInvalid(
      errors,
      ['equivalent', 'static-initialization'].includes(survivor.classification),
      `unsupported survivor classification for ${survivor.file}#${survivor.id}`
    );
    pushWhenInvalid(
      errors,
      Boolean(survivor.reason) &&
        Array.isArray(survivor.evidence) &&
        survivor.evidence.length > 0,
      `allowed survivor requires a reason and evidence: ${survivor.file}#${survivor.id}`
    );
    validateExistingPaths(
      extensionRoot,
      survivor.evidence ?? [],
      'survivor evidence',
      errors
    );
  }
  pushWhenInvalid(
    errors,
    (baseline.allowedSurvivors ?? []).length === baseline.measured?.survived,
    'allowed survivor count must equal the measured survivor count'
  );
}

function validateDeferredScope(extensionRoot, baseline, baselineFiles, errors) {
  for (const deferred of baseline.deferredExpensiveScope?.files ?? []) {
    pushWhenInvalid(
      errors,
      !baselineFiles.includes(deferred.path),
      `deferred mutation file is already in the blocking scope: ${deferred.path}`
    );
    pushWhenInvalid(
      errors,
      Boolean(deferred.owner) && Boolean(deferred.reason),
      `deferred mutation file requires owner and reason: ${deferred.path}`
    );
    validateExistingPaths(
      extensionRoot,
      [deferred.path],
      'deferred mutation scope',
      errors
    );
    validateExistingPaths(
      extensionRoot,
      deferred.evidence ?? [],
      'deferred mutation evidence',
      errors
    );
  }
}

function validateMutationPolicy(extensionRoot) {
  const errors = [];
  const { config, baseline } = loadPolicy(extensionRoot);
  validateStrykerConfiguration(config, baseline, errors);
  const baselineFiles = validateBaselineStructure(
    extensionRoot,
    baseline,
    errors
  );
  validateAllowedSurvivors(extensionRoot, baseline, baselineFiles, errors);
  validateDeferredScope(extensionRoot, baseline, baselineFiles, errors);
  return { errors, config, baseline };
}

function collectReportMutants(report) {
  return Object.entries(report.files ?? {})
    .sort(([left], [right]) => compareStrings(left, right))
    .flatMap(([file, value]) =>
      (value.mutants ?? []).map((mutant) => ({ file, mutant }))
    );
}

function validateReportMetadata(report, config, baseline, errors) {
  pushWhenInvalid(
    errors,
    report.schemaVersion === '1.0',
    `unsupported mutation report schema ${report.schemaVersion}`
  );
  pushWhenInvalid(
    errors,
    sameStringSet(report.config?.mutate, config.mutate),
    'mutation report mutate scope does not match stryker.config.json'
  );
  pushWhenInvalid(
    errors,
    sameStringSet(report.config?.testFiles, config.testFiles),
    'mutation report testFiles do not match stryker.config.json'
  );
  pushWhenInvalid(
    errors,
    report.thresholds?.break === baseline.minimumScore,
    'mutation report break threshold does not match the baseline'
  );
  pushWhenInvalid(
    errors,
    sameStringSet(Object.keys(report.files ?? {}), baseline.scope.mutate),
    'mutation report file set does not match the blocking scope'
  );
}

function validateOverallSummary(overall, baseline, errors) {
  pushWhenInvalid(
    errors,
    overall.mutants >= baseline.scope.minimumMutants,
    `mutation report has ${overall.mutants} mutants; baseline requires at least ${baseline.scope.minimumMutants}`
  );
  pushWhenInvalid(
    errors,
    overall.score + SCORE_EPSILON >= baseline.minimumScore,
    `mutation score ${overall.score} is below blocking baseline ${baseline.minimumScore}`
  );
  pushWhenInvalid(
    errors,
    overall.timeout <= baseline.measured.timeout,
    `mutation timeouts regressed from ${baseline.measured.timeout} to ${overall.timeout}`
  );
  pushWhenInvalid(
    errors,
    overall.noCoverage <= baseline.measured.noCoverage,
    `no-coverage mutants regressed from ${baseline.measured.noCoverage} to ${overall.noCoverage}`
  );
  pushWhenInvalid(
    errors,
    overall.errors <= baseline.measured.errors,
    `mutation errors regressed from ${baseline.measured.errors} to ${overall.errors}`
  );
}

function buildFileSummaries(report, baseline, errors) {
  const summaries = {};
  for (const file of sortedStrings(Object.keys(report.files ?? {}))) {
    const summary = countStatuses(report.files[file]?.mutants ?? []);
    const expected = baseline.files[file];
    summaries[file] = summary;
    if (!expected) {
      continue;
    }
    pushWhenInvalid(
      errors,
      summary.mutants >= expected.minimumMutants,
      `${file} has ${summary.mutants} mutants; baseline requires at least ${expected.minimumMutants}`
    );
    pushWhenInvalid(
      errors,
      summary.score + SCORE_EPSILON >= expected.minimumScore,
      `${file} mutation score ${summary.score} is below ${expected.minimumScore}`
    );
  }
  return summaries;
}

function validateReportSurvivors(entries, baseline, errors) {
  const actual = new Set(
    entries
      .filter(({ mutant }) => mutant.status === 'Survived')
      .map(({ file, mutant }) => survivorFingerprint(file, mutant))
  );
  const allowed = new Set(
    (baseline.allowedSurvivors ?? []).map((survivor) =>
      survivorFingerprint(survivor.file, survivor)
    )
  );
  for (const fingerprint of actual) {
    const survivor = JSON.parse(fingerprint);
    pushWhenInvalid(
      errors,
      allowed.has(fingerprint),
      `undocumented surviving mutant ${survivor.file}#${survivor.id}`
    );
  }
  for (const fingerprint of allowed) {
    const survivor = JSON.parse(fingerprint);
    pushWhenInvalid(
      errors,
      actual.has(fingerprint),
      `stale allowed survivor ${survivor.file}#${survivor.id}`
    );
  }
}

function validateMutationReport(extensionRoot, report) {
  const policy = validateMutationPolicy(extensionRoot);
  const errors = [...policy.errors];
  const { config, baseline } = policy;
  validateReportMetadata(report, config, baseline, errors);
  const entries = collectReportMutants(report);
  const overall = countStatuses(entries.map(({ mutant }) => mutant));
  validateOverallSummary(overall, baseline, errors);
  const files = buildFileSummaries(report, baseline, errors);
  validateReportSurvivors(entries, baseline, errors);
  return { errors, overall, files, baseline };
}

function renderMutationSummaryMarkdown(result) {
  const lines = [
    '# Mutation Baseline',
    '',
    `- Score: **${result.overall.score.toFixed(2)}%** (minimum ${result.baseline.minimumScore}%)`,
    `- Mutants: **${result.overall.mutants}**`,
    `- Killed: **${result.overall.killed}**`,
    `- Survived: **${result.overall.survived}** (${result.baseline.allowedSurvivors.length} documented)`,
    `- Timeout / no coverage / errors: **${result.overall.timeout} / ${result.overall.noCoverage} / ${result.overall.errors}**`,
    '',
    '## Module ratchet',
    '',
    '| File | Score | Minimum | Mutants | Killed | Survived |',
    '| --- | ---: | ---: | ---: | ---: | ---: |'
  ];
  for (const file of sortedStrings(Object.keys(result.files))) {
    const summary = result.files[file];
    const expected = result.baseline.files[file];
    lines.push(
      `| \`${file}\` | ${summary.score.toFixed(2)}% | ${expected.minimumScore}% | ${summary.mutants} | ${summary.killed} | ${summary.survived} |`
    );
  }
  lines.push('', '## Documented survivors', '');
  for (const survivor of result.baseline.allowedSurvivors) {
    lines.push(
      `- \`${survivor.file}#${survivor.id}\` — ${survivor.classification}: ${survivor.reason}`
    );
  }
  lines.push('', '## Deferred expensive shards', '');
  for (const deferred of result.baseline.deferredExpensiveScope.files) {
    lines.push(
      `- \`${deferred.path}\` — ${deferred.owner}: ${deferred.reason}`
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeMutationSummary(extensionRoot, result) {
  const reportDirectory = path.join(extensionRoot, 'reports', 'mutation');
  fs.mkdirSync(reportDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(reportDirectory, 'summary.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        minimumScore: result.baseline.minimumScore,
        overall: result.overall,
        files: result.files,
        documentedSurvivors: result.baseline.allowedSurvivors,
        deferredExpensiveScope: result.baseline.deferredExpensiveScope
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(reportDirectory, 'summary.md'),
    renderMutationSummaryMarkdown(result)
  );
}

function runCli() {
  const extensionRoot = path.resolve(
    path.dirname(require.resolve('./mutation-baseline.cjs')),
    '..'
  );
  const reportFlagIndex = process.argv.indexOf('--report');
  if (reportFlagIndex === -1) {
    const policy = validateMutationPolicy(extensionRoot);
    if (policy.errors.length > 0) {
      process.stderr.write(
        `Mutation policy failed:\n- ${policy.errors.join('\n- ')}\n`
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Mutation policy passed: ${policy.baseline.scope.mutate.length} files, ${policy.baseline.scope.minimumMutants} mutants, ${policy.baseline.minimumScore}% break threshold.\n`
    );
    return;
  }
  const reportPath = process.argv[reportFlagIndex + 1];
  if (!reportPath) {
    throw new Error('--report requires a path');
  }
  const report = readJson(path.resolve(extensionRoot, reportPath));
  const result = validateMutationReport(extensionRoot, report);
  if (process.argv.includes('--write-summary')) {
    writeMutationSummary(extensionRoot, result);
  }
  if (result.errors.length > 0) {
    process.stderr.write(
      `Mutation baseline failed:\n- ${result.errors.join('\n- ')}\n`
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Mutation baseline passed: ${result.overall.score}% score, ${result.overall.killed}/${result.overall.mutants} killed, ${result.overall.survived} documented survivors.\n`
  );
}

module.exports = {
  countStatuses,
  loadPolicy,
  renderMutationSummaryMarkdown,
  survivorFingerprint,
  validateMutationPolicy,
  validateMutationReport,
  writeMutationSummary
};

if (require.main === module) {
  runCli();
}
