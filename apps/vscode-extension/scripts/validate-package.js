#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const defaultRoot = path.resolve(__dirname, '..');
const defaultRepoRoot = path.resolve(defaultRoot, '..', '..');
const allowlistPath = path.join(__dirname, 'package-allowlist.json');
const allowedWebScriptNames = new Set(['test:webview']);

function validatePackage(options = {}) {
  const root = path.resolve(options.root ?? defaultRoot);
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const pkg = options.packageJson ?? readJson(path.join(root, 'package.json'));
  const failures = [];
  const fail = (message) => failures.push(message);

  validateStaticMetadata({ root, repoRoot, pkg, fail });
  validateRequiredRuntimeFiles({ root, fail });
  validateContributionManifest({ root, pkg, fail });
  validateReadmeAndMarketplaceAssets({ root, fail });
  validateVscodeignore({ root, fail });
  validatePackageManager({ root, repoRoot, pkg, fail });

  let packageFiles = options.packageFiles;
  if (options.validatePackageFiles !== false) {
    const allowlist = readJson(allowlistPath);
    packageFiles =
      packageFiles ??
      (options.runVsce === false ? undefined : runVsceList(root));
    if (packageFiles) {
      validatePackageFileList(packageFiles, allowlist, fail);
    } else {
      fail('package file validation requires vsce output or packageFiles');
    }
    validateBundleSizes({ root, allowlist, fail });
  }

  if (failures.length > 0) {
    throw new Error(`Package validation failed:\n- ${failures.join('\n- ')}`);
  }

  return {
    packageFiles: packageFiles ? [...packageFiles] : []
  };
}

function validateStaticMetadata({ root, repoRoot, pkg, fail }) {
  const expected = {
    repository: 'https://github.com/oaslananka/kicad-studio-kit',
    bugs: 'https://github.com/oaslananka/kicad-studio-kit/issues',
    homepage:
      'https://github.com/oaslananka/kicad-studio-kit/tree/main/apps/vscode-extension',
    publisher: 'oaslananka'
  };

  check(
    pkg.repository?.url === expected.repository,
    'repository.url must point to the org repository',
    fail
  );
  check(
    pkg.bugs?.url === expected.bugs,
    'bugs.url must point to org issues',
    fail
  );
  check(
    pkg.homepage === expected.homepage,
    'homepage must point to the extension package in the monorepo',
    fail
  );
  check(
    pkg.publisher === expected.publisher,
    'publisher must remain oaslananka',
    fail
  );
  check(
    pkg.engines?.vscode === '^1.120.0',
    'VS Code engine drifted unexpectedly',
    fail
  );
  check(
    pkg.engines?.node === '24.x',
    'Node runtime drifted unexpectedly',
    fail
  );
  check(
    pkg.main === './dist/extension.js',
    'extension entrypoint drifted unexpectedly',
    fail
  );
  check(
    JSON.stringify(pkg.extensionKind) === JSON.stringify(['workspace']),
    'extensionKind must stay ["workspace"] until ADR-0006 accepts a web target',
    fail
  );
  check(
    pkg.browser === undefined,
    'browser entrypoint must stay absent until ADR-0006 accepts a web target',
    fail
  );

  for (const scriptName of Object.keys(pkg.scripts ?? {})) {
    check(
      !scriptName.includes('web') || allowedWebScriptNames.has(scriptName),
      `web build script must not be introduced before ADR-0006 accepts it: ${scriptName}`,
      fail
    );
  }
  for (const file of ['web/extension.js', 'src/web/extension.ts']) {
    check(
      !fs.existsSync(path.join(root, file)),
      `web extension entrypoint must not exist before ADR-0006 accepts it: ${file}`,
      fail
    );
  }
  check(
    fs.existsSync(path.join(repoRoot, 'pnpm-lock.yaml')),
    'root pnpm-lock.yaml must be committed',
    fail
  );
}

function validateRequiredRuntimeFiles({ root, fail }) {
  for (const file of [
    'dist/extension.js',
    'package.json',
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
    'assets/icon.png',
    'assets/icon-light.png',
    'assets/icon-dark.png',
    'language-configuration.json',
    'schemas/kicad-project.schema.json',
    'schemas/vscode-mcp.kicad.json',
    'syntaxes/kicad-schematic.tmLanguage.json',
    'syntaxes/kicad-pcb.tmLanguage.json',
    'media/kicanvas/kicanvas.js',
    'media/kicanvas/viewer.css',
    'media/viewer/schematic.html',
    'media/viewer/viewer-schematic.js',
    'media/viewer/pcb.html',
    'media/viewer/viewer-pcb.js'
  ]) {
    checkFileExists(
      root,
      file,
      `required runtime file is missing: ${file}`,
      fail
    );
  }
}

function validateContributionManifest({ root, pkg, fail }) {
  const constantsPath = path.join(root, 'src', 'constants.ts');
  const constantsSource = readText(constantsPath);
  const sourceFiles = readSourceFiles(path.join(root, 'src'));
  const sourceText = sourceFiles.map((file) => file.content).join('\n');
  const commandConstants = extractCommandConstants(constantsSource);
  const stringConstants = extractStringConstants(constantsSource);
  const registeredCommandKeys = extractRegisteredCommandKeys(sourceText);
  const registeredViewConstants = extractRegisteredViewConstants(sourceText);
  const registeredCustomEditorConstants =
    extractRegisteredCustomEditorConstants(sourceText);

  for (const command of pkg.contributes?.commands ?? []) {
    const commandId = command.command;
    if (typeof commandId !== 'string' || commandId.length === 0) {
      fail('contributed command is missing a command id');
      continue;
    }
    const constantKey = commandConstants.get(commandId);
    if (!constantKey || !registeredCommandKeys.has(constantKey)) {
      fail(`contributed command is not registered: ${commandId}`);
    }
  }

  for (const view of collectViews(pkg)) {
    if (typeof view.id !== 'string' || view.id.length === 0) {
      fail('contributed view is missing an id');
      continue;
    }
    const constantKey = stringConstants.get(view.id);
    if (!constantKey || !registeredViewConstants.has(constantKey)) {
      fail(`contributed view is not registered: ${view.id}`);
    }
    if (typeof view.icon === 'string') {
      validateThemeSafeIcon({
        root,
        iconPath: view.icon,
        label: `view ${view.id}`,
        fail
      });
    } else {
      fail(`contributed view is missing an icon: ${view.id}`);
    }
  }

  for (const container of pkg.contributes?.viewsContainers?.activitybar ?? []) {
    if (typeof container.icon === 'string') {
      checkFileExists(
        root,
        container.icon,
        `view container icon is missing: ${container.id} -> ${container.icon}`,
        fail
      );
    }
  }

  for (const mediaPath of collectWalkthroughMediaPaths(pkg)) {
    checkFileExists(
      root,
      mediaPath,
      `walkthrough media path is missing: ${mediaPath}`,
      fail
    );
  }

  for (const schema of pkg.contributes?.jsonValidation ?? []) {
    const schemaPath = normalizeRelativePath(schema.url ?? '');
    if (!schemaPath) {
      fail('jsonValidation entry is missing url');
      continue;
    }
    validateJsonFile({
      root,
      relativePath: schemaPath,
      label: `jsonValidation schema ${schemaPath}`,
      fail
    });
  }

  for (const grammar of pkg.contributes?.grammars ?? []) {
    const grammarPath = normalizeRelativePath(grammar.path ?? '');
    if (!grammarPath) {
      fail(`grammar for ${grammar.language ?? '<unknown>'} is missing path`);
      continue;
    }
    validateJsonFile({
      root,
      relativePath: grammarPath,
      label: `grammar ${grammarPath}`,
      fail
    });
  }

  for (const editor of pkg.contributes?.customEditors ?? []) {
    const viewType = editor.viewType;
    const constantKey = stringConstants.get(viewType);
    if (!constantKey || !registeredCustomEditorConstants.has(constantKey)) {
      fail(`custom editor viewType is not registered: ${viewType}`);
    }
  }
}

function validateReadmeAndMarketplaceAssets({ root, fail }) {
  const readme = readText(path.join(root, 'README.md'));
  const readmeAssetPattern = /!\[[^\]]*]\((assets\/[^)#]+)(?:#[^)]+)?\)/g;
  for (const match of readme.matchAll(readmeAssetPattern)) {
    checkFileExists(
      root,
      match[1],
      `README asset is missing: ${match[1]}`,
      fail
    );
  }

  for (const file of [
    'assets/marketplace/core-workflow.gif',
    'assets/marketplace/gallery-banner-background.svg',
    'assets/marketplace/gallery-banner-foreground.svg',
    'assets/marketplace/hero.png',
    'assets/marketplace/hero.svg',
    'assets/marketplace/icon-128.png',
    'assets/marketplace/icon-256.png',
    'assets/screenshots/project-tree.png',
    'assets/screenshots/schematic-viewer.png',
    'assets/screenshots/pcb-viewer.png',
    'assets/screenshots/drc-results.png',
    'assets/screenshots/mcp-tools-dashboard.png'
  ]) {
    checkFileExists(root, file, `marketplace asset is missing: ${file}`, fail);
  }

  const screenshotCount = listFiles(
    path.join(root, 'assets', 'screenshots')
  ).filter((file) => file.endsWith('.png')).length;
  check(
    screenshotCount >= 5,
    `README screenshot set must include at least 5 PNG screenshots; found ${screenshotCount}`,
    fail
  );
}

function validateVscodeignore({ root, fail }) {
  const vscodeignore = readText(path.join(root, '.vscodeignore'));
  for (const pattern of [
    '.github/**',
    'scripts/**',
    'src/**',
    'test/**',
    'coverage/**',
    'node_modules/**',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'release-please-config.json',
    '.release-please-manifest.json',
    'stryker.config.json',
    '*.vsix'
  ]) {
    check(
      vscodeignore.includes(pattern),
      `.vscodeignore must exclude ${pattern}`,
      fail
    );
  }
  check(
    !vscodeignore.includes('dist/**'),
    '.vscodeignore must not exclude dist/**',
    fail
  );
  check(
    !vscodeignore.includes('media/**'),
    '.vscodeignore must not exclude runtime media assets',
    fail
  );
}

function validatePackageManager({ root, repoRoot, pkg, fail }) {
  check(
    pkg.packageManager?.startsWith('pnpm@'),
    'packageManager must pin pnpm',
    fail
  );
  check(
    fs.existsSync(path.join(repoRoot, 'pnpm-lock.yaml')),
    'root pnpm-lock.yaml must be committed',
    fail
  );
  check(
    !fs.existsSync(path.join(root, 'package-lock.json')),
    'package-lock.json must not be committed',
    fail
  );
}

function validatePackageFileList(files, allowlist, fail) {
  const normalizedFiles = files.map(normalizeRelativePath).filter(Boolean);
  const fileSet = new Set(normalizedFiles);
  const allowedFiles = new Set(allowlist.allowedFiles ?? []);
  const allowedGlobs = allowlist.allowedGlobs ?? [];
  const forbiddenGlobs = allowlist.forbiddenGlobs ?? [];

  for (const file of allowlist.requiredFiles ?? []) {
    check(
      fileSet.has(file),
      `required packaged file is missing from vsce ls output: ${file}`,
      fail
    );
  }

  for (const file of normalizedFiles) {
    const forbiddenPattern = forbiddenGlobs.find((pattern) =>
      matchesGlob(file, pattern)
    );
    if (forbiddenPattern) {
      fail(`forbidden packaged file matched ${forbiddenPattern}: ${file}`);
      continue;
    }

    if (
      !allowedFiles.has(file) &&
      !allowedGlobs.some((pattern) => matchesGlob(file, pattern))
    ) {
      fail(
        `packaged file is not allowed by scripts/package-allowlist.json: ${file}`
      );
    }
  }
}

function validateBundleSizes({ root, allowlist, fail }) {
  const baselinePath = path.join(root, 'scripts', 'bundle-size-baseline.json');
  if (!fs.existsSync(baselinePath)) {
    fail(`Missing bundle size baseline: ${baselinePath}`);
    return;
  }
  const baseline = readJson(baselinePath);
  const hardMaxBytes = allowlist.bundleSizeLimitBytes ?? 5 * 1024 * 1024;
  const currentArtifacts = {
    'dist/extension.js': statIfExists(path.join(root, 'dist', 'extension.js')),
    'dist/exceljs.js': statIfExists(path.join(root, 'dist', 'exceljs.js')),
    'media/kicanvas/kicanvas.js': statIfExists(
      path.join(root, 'media', 'kicanvas', 'kicanvas.js')
    ),
    vsix: findLatestVsixSize(root)
  };

  for (const [name, baselineBytes] of Object.entries(
    baseline.artifacts ?? {}
  )) {
    const currentBytes = currentArtifacts[name];
    if (typeof baselineBytes !== 'number') {
      fail(`Invalid bundle size baseline entry for ${name}`);
      continue;
    }
    if (typeof currentBytes !== 'number') {
      fail(`Missing bundle artifact for ${name}`);
      continue;
    }
    if (currentBytes > hardMaxBytes) {
      fail(
        `Bundle size limit exceeded: ${name} is ${formatBytes(
          currentBytes
        )}, above the documented ${formatBytes(hardMaxBytes)} limit`
      );
    }
  }
}

function validateThemeSafeIcon({ root, iconPath, label, fail }) {
  checkFileExists(
    root,
    iconPath,
    `${label} icon is missing: ${iconPath}`,
    fail
  );
  if (!iconPath.endsWith('.svg')) {
    return;
  }
  const svg = readText(path.join(root, iconPath));
  for (const pattern of [
    /<script[\s>]/i,
    /<foreignObject[\s>]/i,
    /(?:href|xlink:href)=["']https?:\/\//i,
    /\bdata:/i
  ]) {
    check(
      !pattern.test(svg),
      `${label} icon is not theme-safe: ${iconPath}`,
      fail
    );
  }
  check(
    svg.includes('currentColor'),
    `${label} icon must use currentColor so VS Code themes can recolor it: ${iconPath}`,
    fail
  );
}

function validateJsonFile({ root, relativePath, label, fail }) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`${label} is missing: ${relativePath}`);
    return;
  }
  try {
    const parsed = JSON.parse(readText(filePath));
    check(
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed),
      `${label} must contain a JSON object`,
      fail
    );
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function collectViews(pkg) {
  return Object.values(pkg.contributes?.views ?? {}).flat();
}

function collectWalkthroughMediaPaths(pkg) {
  const mediaPaths = [];
  for (const walkthrough of pkg.contributes?.walkthroughs ?? []) {
    for (const step of walkthrough.steps ?? []) {
      const media = step.media ?? {};
      pushMediaPath(mediaPaths, media.image);
      pushMediaPath(mediaPaths, media.markdown);
      pushMediaPath(mediaPaths, media.svg);
    }
  }
  return mediaPaths;
}

function pushMediaPath(paths, value) {
  if (typeof value === 'string') {
    paths.push(normalizeRelativePath(value));
    return;
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) {
      pushMediaPath(paths, nested);
    }
  }
}

function extractCommandConstants(constantsSource) {
  const commandBlock = constantsSource.match(
    /export const COMMANDS = \{([\s\S]*?)\} as const;/
  );
  const result = new Map();
  if (!commandBlock) {
    return result;
  }
  for (const match of commandBlock[1].matchAll(
    /^\s*([A-Za-z0-9_]+):\s*'([^']+)'/gm
  )) {
    result.set(match[2], match[1]);
  }
  return result;
}

function extractStringConstants(constantsSource) {
  const result = new Map();
  for (const match of constantsSource.matchAll(
    /export const ([A-Z0-9_]+) = '([^']+)'/g
  )) {
    result.set(match[2], match[1]);
  }
  return result;
}

function extractRegisteredCommandKeys(sourceText) {
  const result = new Set();
  const pattern =
    /(?:registerCommand|registerTrustedCommand)\(\s*COMMANDS\.([A-Za-z0-9_]+)/g;
  for (const match of sourceText.matchAll(pattern)) {
    result.add(match[1]);
  }
  return result;
}

function extractRegisteredViewConstants(sourceText) {
  const result = new Set();
  const pattern =
    /register(?:TreeDataProvider|WebviewViewProvider)\(\s*([A-Z0-9_]+)/g;
  for (const match of sourceText.matchAll(pattern)) {
    result.add(match[1]);
  }
  return result;
}

function extractRegisteredCustomEditorConstants(sourceText) {
  const result = new Set();
  const pattern = /registerCustomEditorProvider\(\s*([A-Z0-9_]+)/g;
  for (const match of sourceText.matchAll(pattern)) {
    result.add(match[1]);
  }
  return result;
}

function runVsceList(root) {
  const invocation =
    process.platform === 'win32'
      ? {
          command: process.env.ComSpec ?? 'cmd.exe',
          args: ['/d', '/s', '/c', 'vsce ls --no-dependencies']
        }
      : { command: 'vsce', args: ['ls', '--no-dependencies'] };
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    encoding: 'utf8',
    shell: false
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `vsce ls failed with exit ${result.status}:\n${result.stdout}\n${result.stderr}`
    );
  }
  return parseVsceFileList(result.stdout);
}

function parseVsceFileList(output) {
  return output
    .split(/\r?\n/)
    .map((line) => normalizeRelativePath(line.trim()))
    .filter(Boolean);
}

function readSourceFiles(root) {
  return listFiles(root)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => ({
      path: file,
      content: readText(file)
    }));
}

function listFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(entryPath));
    } else if (entry.isFile()) {
      result.push(entryPath);
    }
  }
  return result;
}

function checkFileExists(root, relativePath, message, fail) {
  check(
    fs.existsSync(path.join(root, normalizeRelativePath(relativePath))),
    message,
    fail
  );
}

function check(condition, message, fail) {
  if (!condition) {
    fail(message);
  }
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeRelativePath(filePath) {
  const normalized = String(filePath ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('../')) {
    return '';
  }
  return normalized;
}

function matchesGlob(file, pattern) {
  return globToRegExp(pattern).test(file);
}

function globToRegExp(pattern) {
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      const afterDoubleStar = pattern[index + 2];
      if (afterDoubleStar === '/') {
        expression += '(?:.*\\/)?';
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
    expression += escapeRegExp(char);
  }
  return new RegExp(`${expression}$`);
}

function escapeRegExp(char) {
  return /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char;
}

function statIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : undefined;
}

function findLatestVsixSize(root) {
  const vsixFiles = fs
    .readdirSync(root)
    .filter((entry) => entry.endsWith('.vsix'))
    .map((entry) => ({
      path: path.join(root, entry),
      stat: fs.statSync(path.join(root, entry))
    }))
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);

  return vsixFiles[0]?.stat.size;
}

function formatBytes(value) {
  return `${(value / 1024).toFixed(1)} KiB`;
}

if (require.main === module) {
  try {
    const result = validatePackage();
    console.log(
      `Package validation passed for ${result.packageFiles.length} packaged files.`
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  matchesGlob,
  parseVsceFileList,
  validatePackage,
  validatePackageFileList
};
