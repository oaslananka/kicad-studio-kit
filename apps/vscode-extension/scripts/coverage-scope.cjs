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

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function normalizePattern(pattern) {
  return String(pattern)
    .replace(/^!/, '')
    .replace(/^<rootDir>\//, '')
    .replace(/^\.\//, '')
    .replaceAll('\\', '/');
}

function matchGlob(filePath, pattern) {
  const input = toPosix(filePath);
  const glob = normalizePattern(pattern);
  let expression = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      if (glob[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
      continue;
    }
    if (char === '*') {
      expression += '[^/]*';
      continue;
    }
    if (char === '?') {
      expression += '[^/]';
      continue;
    }
    expression += char.replace(/[|\\{}()[\]^$+?.]/gu, '\\$&');
  }
  expression += '$';
  return new RegExp(expression, 'u').test(input);
}

function listTypeScriptSourceFiles(extensionRoot) {
  const sourceRoot = path.join(extensionRoot, 'src');
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const text = fs.readFileSync(absolute, 'utf8');
        files.push({
          path: toPosix(path.relative(extensionRoot, absolute)),
          lines: text.length === 0 ? 0 : text.split(/\r?\n/u).length,
          excludedBy: []
        });
      }
    }
  };
  visit(sourceRoot);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function loadCommonJs(filePath) {
  const resolved = require.resolve(filePath);
  delete require.cache[resolved];
  return require(resolved);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeConfiguredPaths(values) {
  return (values ?? []).map(normalizePattern).sort();
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
    const classification = manifest.exclusions?.[sourceFile.path] ?? {
      category: sourceFile.path.endsWith('.d.ts')
        ? manifest.declarationExclusion?.category
        : 'unclassified',
      owner: sourceFile.path.endsWith('.d.ts')
        ? manifest.declarationExclusion?.owner
        : 'unclassified',
      strategy: sourceFile.path.endsWith('.d.ts')
        ? manifest.declarationExclusion?.strategy
        : 'unclassified',
      rationale: sourceFile.path.endsWith('.d.ts')
        ? manifest.declarationExclusion?.rationale
        : 'unclassified',
      evidence: sourceFile.path.endsWith('.d.ts')
        ? manifest.declarationExclusion?.evidence
        : []
    };
    excluded.push({
      path: sourceFile.path,
      lines: sourceFile.lines,
      excludedBy: [...sourceFile.excludedBy].sort(),
      ...classification
    });
  }

  included.sort((left, right) => left.path.localeCompare(right.path));
  excluded.sort((left, right) => left.path.localeCompare(right.path));

  const categorySummary = {};
  for (const item of excluded) {
    const key = item.category ?? 'unclassified';
    const current = categorySummary[key] ?? { files: 0, lines: 0 };
    current.files += 1;
    current.lines += item.lines;
    categorySummary[key] = current;
  }

  return {
    schemaVersion: manifest.schemaVersion,
    description: manifest.description,
    summary: {
      sourceFiles: sourceFiles.length,
      includedFiles: included.length,
      excludedFiles: excluded.length,
      includedLines: included.reduce((sum, item) => sum + item.lines, 0),
      excludedLines: excluded.reduce((sum, item) => sum + item.lines, 0),
      categories: Object.fromEntries(
        Object.entries(categorySummary).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      )
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
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
    errors.push(`${source}.evidence must contain at least one repository path`);
  } else {
    for (const evidencePath of entry.evidence) {
      if (
        typeof evidencePath !== 'string' ||
        !fs.existsSync(path.join(extensionRoot, evidencePath))
      ) {
        errors.push(
          `${source}.evidence references missing path ${evidencePath}`
        );
      }
    }
  }
}

function validateCoverageScope(extensionRoot) {
  const errors = [];
  const jestConfigPath = path.join(extensionRoot, 'jest.config.js');
  const ratchetConfigPath = path.join(
    extensionRoot,
    'jest.coverage-ratchet.config.js'
  );
  const manifestPath = path.join(extensionRoot, 'coverage-scope.json');

  let jestConfig;
  let ratchetConfig;
  let manifest;
  try {
    jestConfig = loadCommonJs(jestConfigPath);
  } catch (error) {
    errors.push(`Unable to load jest.config.js: ${error.message}`);
    jestConfig = {};
  }
  try {
    ratchetConfig = loadCommonJs(ratchetConfigPath);
  } catch (error) {
    errors.push(
      `Unable to load jest.coverage-ratchet.config.js: ${error.message}`
    );
    ratchetConfig = {};
  }
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    errors.push(`Unable to load coverage-scope.json: ${error.message}`);
    manifest = { schemaVersion: 0, exclusions: {}, ratchet: {} };
  }

  if (manifest.schemaVersion !== 1) {
    errors.push('coverage-scope.json schemaVersion must be 1');
  }

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
  if (
    manifest.declarationExclusion?.pattern &&
    !negativePatterns.includes(manifest.declarationExclusion.pattern)
  ) {
    errors.push(
      `jest.config.js must retain declaration exclusion ${manifest.declarationExclusion.pattern}`
    );
  }

  validateMetadataEntry(
    manifest.declarationExclusion,
    'coverage-scope.json declarationExclusion',
    extensionRoot,
    errors
  );

  const sourceFiles = listTypeScriptSourceFiles(extensionRoot).map(
    (sourceFile) => {
      const included = positivePatterns.some((pattern) =>
        matchGlob(sourceFile.path, pattern)
      );
      const excludedBy = negativePatterns.filter((pattern) =>
        matchGlob(sourceFile.path, pattern)
      );
      if (!included) {
        errors.push(
          `collectCoverageFrom does not include shipped source ${sourceFile.path}`
        );
      }
      return { ...sourceFile, excludedBy };
    }
  );

  const excludedRuntimeFiles = sourceFiles.filter(
    (sourceFile) =>
      sourceFile.excludedBy.length > 0 && !sourceFile.path.endsWith('.d.ts')
  );
  const actualExcludedPaths = new Set(
    excludedRuntimeFiles.map((sourceFile) => sourceFile.path)
  );
  const classifiedPaths = new Set(Object.keys(manifest.exclusions ?? {}));

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
  for (const classifiedPath of classifiedPaths) {
    if (!actualExcludedPaths.has(classifiedPath)) {
      errors.push(
        `stale classification for non-excluded source ${classifiedPath}`
      );
    }
  }

  const ratchetFiles = manifest.ratchet?.files ?? [];
  const ratchetTests = manifest.ratchet?.tests ?? [];
  if (!Array.isArray(ratchetFiles) || ratchetFiles.length === 0) {
    errors.push('coverage-scope.json ratchet.files must not be empty');
  }
  if (!Array.isArray(ratchetTests) || ratchetTests.length === 0) {
    errors.push('coverage-scope.json ratchet.tests must not be empty');
  }
  for (const filePath of ratchetFiles) {
    const entry = manifest.exclusions?.[filePath];
    if (!actualExcludedPaths.has(filePath)) {
      errors.push(
        `ratchet file is not excluded from headline coverage: ${filePath}`
      );
    }
    if (entry?.coverageMode !== 'targeted-ratchet') {
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

  const configuredRatchetFiles = normalizeConfiguredPaths(
    ratchetConfig.collectCoverageFrom
  );
  const configuredRatchetTests = normalizeConfiguredPaths(
    ratchetConfig.testMatch
  );
  const expectedRatchetFiles = [...ratchetFiles].sort();
  const expectedRatchetTests = [...ratchetTests].sort();
  if (
    JSON.stringify(configuredRatchetFiles) !==
    JSON.stringify(expectedRatchetFiles)
  ) {
    errors.push(
      'jest.coverage-ratchet.config.js file set must match coverage-scope.json'
    );
  }
  if (
    JSON.stringify(configuredRatchetTests) !==
    JSON.stringify(expectedRatchetTests)
  ) {
    errors.push(
      'jest.coverage-ratchet.config.js test set must match coverage-scope.json'
    );
  }

  const ratchetThresholds = ratchetConfig.coverageThreshold ?? {};
  const thresholdPaths = Object.keys(ratchetThresholds).sort();
  if (JSON.stringify(thresholdPaths) !== JSON.stringify(expectedRatchetFiles)) {
    errors.push(
      'ratchet coverageThreshold keys must match the ratchet file set'
    );
  }
  for (const filePath of expectedRatchetFiles) {
    const thresholds = ratchetThresholds[filePath];
    if (!thresholds) {
      continue;
    }
    for (const metric of REQUIRED_METRICS) {
      if (typeof thresholds[metric] !== 'number') {
        errors.push(`ratchet threshold ${filePath}.${metric} must be numeric`);
      }
    }
  }

  const globalThresholds = jestConfig.coverageThreshold?.global ?? {};
  for (const metric of REQUIRED_METRICS) {
    if (typeof globalThresholds[metric] !== 'number') {
      errors.push(`jest.config.js global ${metric} threshold must be numeric`);
    }
  }

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
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
}

function renderCoverageInventoryMarkdown(inventory) {
  const lines = [
    '# Coverage Scope Inventory',
    '',
    'This report describes the measured unit-coverage denominator and every shipped TypeScript source file excluded from it.',
    '',
    '## Measured unit-coverage denominator',
    '',
    `- Shipped TypeScript files: **${inventory.summary.sourceFiles}**`,
    `- Included files: **${inventory.summary.includedFiles}** (${inventory.summary.includedLines} source lines)`,
    `- Excluded files: **${inventory.summary.excludedFiles}** (${inventory.summary.excludedLines} source lines)`,
    `- Global thresholds: statements ${inventory.measuredDenominator.globalThresholds.statements}, branches ${inventory.measuredDenominator.globalThresholds.branches}, functions ${inventory.measuredDenominator.globalThresholds.functions}, lines ${inventory.measuredDenominator.globalThresholds.lines}`,
    '',
    'The headline percentage applies only to the included denominator above. Excluded files are owned by host integration coverage or the targeted ratchet below.',
    '',
    '## Excluded source ownership',
    '',
    '| Path | Lines | Category | Coverage mode | Owner | Strategy | Evidence |',
    '| --- | ---: | --- | --- | --- | --- | --- |'
  ];
  for (const item of inventory.excluded) {
    lines.push(
      `| \`${escapeMarkdown(item.path)}\` | ${item.lines} | ${escapeMarkdown(item.category)} | ${escapeMarkdown(item.coverageMode ?? 'host/integration')} | ${escapeMarkdown(item.owner)} | ${escapeMarkdown(item.strategy)} | ${(item.evidence ?? []).map((entry) => `\`${escapeMarkdown(entry)}\``).join('<br>')} |`
    );
  }
  lines.push('', '## Targeted ratchet', '');
  lines.push(
    `The focused ratchet covers **${inventory.ratchet.files.length}** critical excluded files with **${inventory.ratchet.tests.length}** deterministic test files. Negative thresholds are maximum uncovered counts; adding uncovered behavior fails the gate.`
  );
  lines.push(
    '',
    '| Path | Statements | Branches | Functions | Lines |',
    '| --- | ---: | ---: | ---: | ---: |'
  );
  for (const filePath of inventory.ratchet.files) {
    const threshold = inventory.ratchet.thresholds[filePath];
    lines.push(
      `| \`${filePath}\` | ${threshold.statements} | ${threshold.branches} | ${threshold.functions} | ${threshold.lines} |`
    );
  }
  lines.push('');
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
    for (const error of result.errors) {
      process.stderr.write(`- ${error}\n`);
    }
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
