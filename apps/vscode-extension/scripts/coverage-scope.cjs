#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const ALLOWED_CATEGORIES = new Set([
  'generated',
  'vendored',
  'integration-owned',
  'explicitly-justified'
]);
const REQUIRED_METRICS = ['lines', 'statements', 'branches', 'functions'];
const REGEX_SPECIAL_CHARACTER = /[|\\{}()[\]^$+?.]/gu;
const compareStrings = (left, right) => left.localeCompare(right);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function sortedStrings(values) {
  return [...values].sort(compareStrings);
}

function normalizePattern(pattern) {
  return String(pattern)
    .replace(/^!/u, '')
    .replace(/^<rootDir>\//u, '')
    .replace(/^\.\//u, '')
    .replaceAll('\\', '/');
}

function escapeRegexCharacter(character) {
  return character.replace(REGEX_SPECIAL_CHARACTER, String.raw`\$&`);
}

function matchGlob(filePath, pattern) {
  const input = toPosix(filePath);
  const glob = normalizePattern(pattern);
  let expression = '^';

  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    const nextCharacter = glob[index + 1];
    if (character === '*' && nextCharacter === '*') {
      const hasDirectorySuffix = glob[index + 2] === '/';
      expression += hasDirectorySuffix ? '(?:.*/)?' : '.*';
      index += hasDirectorySuffix ? 2 : 1;
      continue;
    }
    if (character === '*') {
      expression += '[^/]*';
      continue;
    }
    if (character === '?') {
      expression += '[^/]';
      continue;
    }
    expression += escapeRegexCharacter(character);
  }

  return new RegExp(`${expression}$`, 'u').test(input);
}

function listTypeScriptSourceFiles(extensionRoot) {
  const sourceRoot = path.join(extensionRoot, 'src');
  const files = [];

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.ts')) {
        continue;
      }
      const text = fs.readFileSync(absolutePath, 'utf8');
      files.push({
        path: toPosix(path.relative(extensionRoot, absolutePath)),
        lines: text.length === 0 ? 0 : text.split(/\r?\n/u).length,
        excludedBy: []
      });
    }
  };

  visit(sourceRoot);
  return files.sort((left, right) => compareStrings(left.path, right.path));
}

function loadCommonJs(filePath) {
  const resolvedPath = require.resolve(filePath);
  delete require.cache[resolvedPath];
  return require(resolvedPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadWithFallback({ label, loader, fallback, errors }) {
  try {
    return loader();
  } catch (error) {
    errors.push(`Unable to load ${label}: ${error.message}`);
    return fallback;
  }
}

function loadCoverageConfiguration(extensionRoot, errors) {
  return {
    jestConfig: loadWithFallback({
      label: 'jest.config.js',
      loader: () => loadCommonJs(path.join(extensionRoot, 'jest.config.js')),
      fallback: {},
      errors
    }),
    ratchetConfig: loadWithFallback({
      label: 'jest.coverage-ratchet.config.js',
      loader: () =>
        loadCommonJs(
          path.join(extensionRoot, 'jest.coverage-ratchet.config.js')
        ),
      fallback: {},
      errors
    }),
    manifest: loadWithFallback({
      label: 'coverage-scope.json',
      loader: () => readJson(path.join(extensionRoot, 'coverage-scope.json')),
      fallback: { schemaVersion: 0, exclusions: {}, ratchet: {} },
      errors
    })
  };
}

function normalizeConfiguredPaths(values) {
  return sortedStrings((values ?? []).map(normalizePattern));
}

function declarationClassification(manifest) {
  return {
    category: manifest.declarationExclusion?.category,
    owner: manifest.declarationExclusion?.owner,
    strategy: manifest.declarationExclusion?.strategy,
    rationale: manifest.declarationExclusion?.rationale,
    evidence: manifest.declarationExclusion?.evidence
  };
}

function classificationFor(sourceFile, manifest) {
  const classification = manifest.exclusions?.[sourceFile.path];
  if (classification) {
    return classification;
  }
  if (sourceFile.path.endsWith('.d.ts')) {
    return declarationClassification(manifest);
  }
  return {
    category: 'unclassified',
    owner: 'unclassified',
    strategy: 'unclassified',
    rationale: 'unclassified',
    evidence: []
  };
}

function summarizeCategories(excluded) {
  const categorySummary = {};
  for (const item of excluded) {
    const category = item.category ?? 'unclassified';
    const summary = categorySummary[category] ?? { files: 0, lines: 0 };
    summary.files += 1;
    summary.lines += item.lines;
    categorySummary[category] = summary;
  }
  return Object.fromEntries(
    Object.entries(categorySummary).sort(([left], [right]) =>
      compareStrings(left, right)
    )
  );
}

function buildCoverageInventory({
  sourceFiles,
  manifest,
  globalThresholds,
  ratchetThresholds,
  collectCoverageFrom = []
}) {
  const included = [];
  const excluded = [];

  for (const sourceFile of sourceFiles) {
    if ((sourceFile.excludedBy ?? []).length === 0) {
      included.push({ path: sourceFile.path, lines: sourceFile.lines });
      continue;
    }
    excluded.push({
      path: sourceFile.path,
      lines: sourceFile.lines,
      excludedBy: sortedStrings(sourceFile.excludedBy),
      ...classificationFor(sourceFile, manifest)
    });
  }

  included.sort((left, right) => compareStrings(left.path, right.path));
  excluded.sort((left, right) => compareStrings(left.path, right.path));

  return {
    schemaVersion: manifest.schemaVersion,
    description: manifest.description,
    summary: {
      sourceFiles: sourceFiles.length,
      includedFiles: included.length,
      excludedFiles: excluded.length,
      includedLines: included.reduce((sum, item) => sum + item.lines, 0),
      excludedLines: excluded.reduce((sum, item) => sum + item.lines, 0),
      categories: summarizeCategories(excluded)
    },
    measuredDenominator: {
      collectCoverageFrom,
      globalThresholds
    },
    included,
    excluded,
    ratchet: {
      files: [...(manifest.ratchet?.files ?? [])],
      tests: [...(manifest.ratchet?.tests ?? [])],
      thresholds: ratchetThresholds
    }
  };
}

function validateEvidence(entry, source, extensionRoot, errors) {
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
    errors.push(`${source}.evidence must contain at least one repository path`);
    return;
  }
  for (const evidencePath of entry.evidence) {
    const isValidPath =
      typeof evidencePath === 'string' &&
      fs.existsSync(path.join(extensionRoot, evidencePath));
    if (!isValidPath) {
      errors.push(`${source}.evidence references missing path ${evidencePath}`);
    }
  }
}

function validateMetadataEntry(entry, source, extensionRoot, errors) {
  if (!entry || typeof entry !== 'object') {
    errors.push(`${source} must be an object`);
    return;
  }
  if (!ALLOWED_CATEGORIES.has(entry.category)) {
    errors.push(
      `${source} has unsupported category ${JSON.stringify(entry.category)}`
    );
  }
  for (const field of ['owner', 'strategy', 'rationale']) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      errors.push(`${source}.${field} must be a non-empty string`);
    }
  }
  validateEvidence(entry, source, extensionRoot, errors);
}

function readCoveragePatterns(jestConfig, manifest, errors) {
  const coveragePatterns = Array.isArray(jestConfig.collectCoverageFrom)
    ? jestConfig.collectCoverageFrom
    : [];
  const positivePatterns = coveragePatterns.filter(
    (pattern) => !String(pattern).startsWith('!')
  );
  const negativePatterns = coveragePatterns.filter((pattern) =>
    String(pattern).startsWith('!')
  );

  if (positivePatterns.length === 0) {
    errors.push(
      'jest.config.js must define a positive collectCoverageFrom pattern'
    );
  }
  const declarationPattern = manifest.declarationExclusion?.pattern;
  if (declarationPattern && !negativePatterns.includes(declarationPattern)) {
    errors.push(
      `jest.config.js must retain declaration exclusion ${declarationPattern}`
    );
  }

  return { coveragePatterns, positivePatterns, negativePatterns };
}

function applyCoveragePatterns(
  extensionRoot,
  positivePatterns,
  negativePatterns,
  errors
) {
  return listTypeScriptSourceFiles(extensionRoot).map((sourceFile) => {
    const isIncluded = positivePatterns.some((pattern) =>
      matchGlob(sourceFile.path, pattern)
    );
    if (!isIncluded) {
      errors.push(
        `collectCoverageFrom does not include shipped source ${sourceFile.path}`
      );
    }
    return {
      ...sourceFile,
      excludedBy: negativePatterns.filter((pattern) =>
        matchGlob(sourceFile.path, pattern)
      )
    };
  });
}

function validateManifest(manifest, extensionRoot, errors) {
  if (manifest.schemaVersion !== 1) {
    errors.push('coverage-scope.json schemaVersion must be 1');
  }
  validateMetadataEntry(
    manifest.declarationExclusion,
    'coverage-scope.json declarationExclusion',
    extensionRoot,
    errors
  );
}

function validateExclusionOwnership(
  sourceFiles,
  manifest,
  extensionRoot,
  errors
) {
  const excludedRuntimeFiles = sourceFiles.filter(
    (sourceFile) =>
      sourceFile.excludedBy.length > 0 && !sourceFile.path.endsWith('.d.ts')
  );
  const actualExcludedPaths = new Set(
    excludedRuntimeFiles.map((sourceFile) => sourceFile.path)
  );

  for (const sourceFile of excludedRuntimeFiles) {
    const entry = manifest.exclusions?.[sourceFile.path];
    if (!entry) {
      errors.push(
        `missing classification for excluded source ${sourceFile.path}`
      );
      continue;
    }
    validateMetadataEntry(
      entry,
      `coverage-scope.json exclusions.${sourceFile.path}`,
      extensionRoot,
      errors
    );
  }

  for (const classifiedPath of Object.keys(manifest.exclusions ?? {})) {
    if (!actualExcludedPaths.has(classifiedPath)) {
      errors.push(
        `stale classification for non-excluded source ${classifiedPath}`
      );
    }
  }
  return actualExcludedPaths;
}

function validateRatchetEntries(
  manifest,
  actualExcludedPaths,
  extensionRoot,
  errors
) {
  const ratchetFiles = Array.isArray(manifest.ratchet?.files)
    ? manifest.ratchet.files
    : [];
  const ratchetTests = Array.isArray(manifest.ratchet?.tests)
    ? manifest.ratchet.tests
    : [];

  if (ratchetFiles.length === 0) {
    errors.push('coverage-scope.json ratchet.files must not be empty');
  }
  if (ratchetTests.length === 0) {
    errors.push('coverage-scope.json ratchet.tests must not be empty');
  }

  for (const filePath of ratchetFiles) {
    if (!actualExcludedPaths.has(filePath)) {
      errors.push(
        `ratchet file is not excluded from headline coverage: ${filePath}`
      );
    }
    if (manifest.exclusions?.[filePath]?.coverageMode !== 'targeted-ratchet') {
      errors.push(
        `ratchet file must declare targeted-ratchet mode: ${filePath}`
      );
    }
  }
  for (const testPath of ratchetTests) {
    if (!fs.existsSync(path.join(extensionRoot, testPath))) {
      errors.push(`ratchet test path does not exist: ${testPath}`);
    }
  }

  return { ratchetFiles, ratchetTests };
}

function listsMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateThresholdMetrics(thresholds, source, errors) {
  if (!thresholds) {
    errors.push(`${source} must define coverage thresholds`);
    return;
  }
  for (const metric of REQUIRED_METRICS) {
    if (typeof thresholds[metric] !== 'number') {
      errors.push(`${source}.${metric} must be numeric`);
    }
  }
}

function validateRatchetConfiguration(
  ratchetConfig,
  ratchetFiles,
  ratchetTests,
  errors
) {
  const expectedFiles = sortedStrings(ratchetFiles);
  const expectedTests = sortedStrings(ratchetTests);
  const configuredFiles = normalizeConfiguredPaths(
    ratchetConfig.collectCoverageFrom
  );
  const configuredTests = normalizeConfiguredPaths(ratchetConfig.testMatch);

  if (!listsMatch(configuredFiles, expectedFiles)) {
    errors.push(
      'jest.coverage-ratchet.config.js file set must match coverage-scope.json'
    );
  }
  if (!listsMatch(configuredTests, expectedTests)) {
    errors.push(
      'jest.coverage-ratchet.config.js test set must match coverage-scope.json'
    );
  }

  const ratchetThresholds = ratchetConfig.coverageThreshold ?? {};
  const thresholdPaths = sortedStrings(Object.keys(ratchetThresholds));
  if (!listsMatch(thresholdPaths, expectedFiles)) {
    errors.push(
      'ratchet coverageThreshold keys must match the ratchet file set'
    );
  }
  for (const filePath of expectedFiles) {
    validateThresholdMetrics(
      ratchetThresholds[filePath],
      `ratchet threshold ${filePath}`,
      errors
    );
  }
  return ratchetThresholds;
}

function validateGlobalThresholds(jestConfig, errors) {
  const globalThresholds = jestConfig.coverageThreshold?.global ?? {};
  validateThresholdMetrics(
    globalThresholds,
    'jest.config.js global threshold',
    errors
  );
  return globalThresholds;
}

function validateCoverageScope(extensionRoot) {
  const errors = [];
  const { jestConfig, ratchetConfig, manifest } = loadCoverageConfiguration(
    extensionRoot,
    errors
  );
  validateManifest(manifest, extensionRoot, errors);

  const { coveragePatterns, positivePatterns, negativePatterns } =
    readCoveragePatterns(jestConfig, manifest, errors);
  const sourceFiles = applyCoveragePatterns(
    extensionRoot,
    positivePatterns,
    negativePatterns,
    errors
  );
  const actualExcludedPaths = validateExclusionOwnership(
    sourceFiles,
    manifest,
    extensionRoot,
    errors
  );
  const { ratchetFiles, ratchetTests } = validateRatchetEntries(
    manifest,
    actualExcludedPaths,
    extensionRoot,
    errors
  );
  const ratchetThresholds = validateRatchetConfiguration(
    ratchetConfig,
    ratchetFiles,
    ratchetTests,
    errors
  );
  const globalThresholds = validateGlobalThresholds(jestConfig, errors);
  const inventory = buildCoverageInventory({
    sourceFiles,
    manifest,
    globalThresholds,
    ratchetThresholds,
    collectCoverageFrom: coveragePatterns
  });

  return { errors, inventory };
}

function escapeMarkdown(value) {
  return String(value ?? '')
    .replaceAll('|', String.raw`\|`)
    .replaceAll('\n', ' ');
}

function markdownCode(value) {
  return `\`${escapeMarkdown(value)}\``;
}

function formatEvidence(evidence) {
  return (evidence ?? []).map(markdownCode).join('<br>');
}

function formatExcludedRow(item) {
  const cells = [
    markdownCode(item.path),
    item.lines,
    escapeMarkdown(item.category),
    escapeMarkdown(item.coverageMode ?? 'host/integration'),
    escapeMarkdown(item.owner),
    escapeMarkdown(item.strategy),
    formatEvidence(item.evidence)
  ];
  return `| ${cells.join(' | ')} |`;
}

function formatRatchetRow(filePath, threshold) {
  const cells = [
    markdownCode(filePath),
    threshold.statements,
    threshold.branches,
    threshold.functions,
    threshold.lines
  ];
  return `| ${cells.join(' | ')} |`;
}

function renderCoverageInventoryMarkdown(inventory) {
  const summary = inventory.summary;
  const global = inventory.measuredDenominator.globalThresholds;
  const excludedRows = inventory.excluded.map(formatExcludedRow);
  const ratchetRows = inventory.ratchet.files.map((filePath) =>
    formatRatchetRow(filePath, inventory.ratchet.thresholds[filePath])
  );
  const lines = [
    '# Coverage Scope Inventory',
    '',
    'This report describes the measured unit-coverage denominator and every shipped TypeScript source file excluded from it.',
    '',
    '## Measured unit-coverage denominator',
    '',
    `- Shipped TypeScript files: **${summary.sourceFiles}**`,
    `- Included files: **${summary.includedFiles}** (${summary.includedLines} source lines)`,
    `- Excluded files: **${summary.excludedFiles}** (${summary.excludedLines} source lines)`,
    `- Global thresholds: statements ${global.statements}, branches ${global.branches}, functions ${global.functions}, lines ${global.lines}`,
    '',
    'The headline percentage applies only to the included denominator above. Excluded files are owned by host integration coverage or the targeted ratchet below.',
    '',
    '## Excluded source ownership',
    '',
    '| Path | Lines | Category | Coverage mode | Owner | Strategy | Evidence |',
    '| --- | ---: | --- | --- | --- | --- | --- |',
    ...excludedRows,
    '',
    '## Targeted ratchet',
    '',
    `The focused ratchet covers **${inventory.ratchet.files.length}** critical excluded files with **${inventory.ratchet.tests.length}** deterministic test files. Negative thresholds are maximum uncovered counts; adding uncovered behavior fails the gate.`,
    '',
    '| Path | Statements | Branches | Functions | Lines |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...ratchetRows,
    ''
  ];
  return `${lines.join('\n')}\n`;
}

function writeCoverageInventory(extensionRoot, inventory) {
  const coverageDirectory = path.join(extensionRoot, 'coverage');
  fs.mkdirSync(coverageDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(coverageDirectory, 'coverage-scope.json'),
    `${JSON.stringify(inventory, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(coverageDirectory, 'coverage-scope.md'),
    renderCoverageInventoryMarkdown(inventory)
  );
}

function runCli() {
  const scriptRoot = path.dirname(require.resolve('./coverage-scope.cjs'));
  const extensionRoot = path.resolve(scriptRoot, '..');
  const result = validateCoverageScope(extensionRoot);
  if (result.errors.length > 0) {
    process.stderr.write('Coverage scope policy failed:\n');
    const errorDetails = result.errors.map((error) => `- ${error}`).join('\n');
    process.stderr.write(`${errorDetails}\n`);
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--write')) {
    writeCoverageInventory(extensionRoot, result.inventory);
  }
  process.stdout.write(
    `Coverage scope policy passed: ${result.inventory.summary.includedFiles} included, ${result.inventory.summary.excludedFiles} excluded, ${result.inventory.ratchet.files.length} ratcheted.\n`
  );
}

module.exports = {
  buildCoverageInventory,
  matchGlob,
  renderCoverageInventoryMarkdown,
  validateCoverageScope,
  writeCoverageInventory
};

if (require.main === module) {
  runCli();
}
