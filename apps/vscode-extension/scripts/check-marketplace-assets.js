#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const maxScreenshotBytes = 2 * 1024 * 1024;
const baseImageHost = 'https://raw.githubusercontent.com/';
const listingScreenshots = [
  'assets/screenshots/project-tree.png',
  'assets/screenshots/schematic-viewer.png',
  'assets/screenshots/pcb-viewer.png',
  'assets/screenshots/drc-results.png',
  'assets/screenshots/bom-table.png'
];
const capturedScreenshots = [
  ...listingScreenshots,
  'assets/screenshots/mcp-tools-dashboard.png'
];
const requiredSvgAssets = [
  'assets/marketplace/gallery-banner-background.svg',
  'assets/marketplace/gallery-banner-foreground.svg',
  'assets/marketplace/hero.svg'
];
const obsoleteSyntheticAssets = [
  'assets/marketplace/core-workflow.gif',
  'assets/screenshots/ai-assistant.png',
  'assets/screenshots/component-search.png',
  'assets/screenshots/git-diff.png',
  'assets/screenshots/quality-gates.png'
];

function fail(message) {
  throw new Error(message);
}

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function assertFile(relativePath) {
  const filePath = absolute(relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`${relativePath} is missing`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    fail(`${relativePath} is not a file`);
  }
  if (stat.size === 0) {
    fail(`${relativePath} is empty`);
  }
  return { filePath, stat };
}

function readText(relativePath) {
  const { filePath } = assertFile(relativePath);
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readPngSize(relativePath) {
  const { filePath } = assertFile(relativePath);
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    fail(`${relativePath} is not a PNG file`);
  }
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    fail(`${relativePath} does not contain a valid PNG IHDR chunk`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function assertPng(relativePath, expectedWidth, expectedHeight) {
  const result = assertFile(relativePath);
  const size = readPngSize(relativePath);
  if (size.width !== expectedWidth || size.height !== expectedHeight) {
    fail(
      relativePath +
        ' is ' +
        size.width +
        'x' +
        size.height +
        '; expected ' +
        expectedWidth +
        'x' +
        expectedHeight
    );
  }
  if (result.stat.size >= maxScreenshotBytes) {
    fail(relativePath + ' is too large: ' + result.stat.size + ' bytes');
  }
}
function assertSvg(relativePath) {
  const svg = readText(relativePath);
  if (!svg.includes('<svg')) fail(relativePath + ' is missing an <svg> root');
  if (!/\bwidth="[^"]+"/u.test(svg) || !/\bheight="[^"]+"/u.test(svg)) {
    fail(relativePath + ' must declare width and height');
  }
  if (/\b(?:href|src)="https?:\/\//u.test(svg)) {
    fail(relativePath + ' must not depend on remote assets');
  }
}
function gitBlobHash(relativePath) {
  return execFileSync('git', ['hash-object', '--', relativePath], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function fileExistsInWorkingTree(relativePath) {
  try {
    gitBlobHash(relativePath);
    return true;
  } catch {
    return false;
  }
}

function contentFingerprint(relativePath) {
  return crypto
    .createHash('sha256')
    .update('git-blob:')
    .update(gitBlobHash(relativePath))
    .digest('hex');
}

function hashFiles(relativePaths) {
  const hash = crypto.createHash('sha256');
  for (const relativePath of [...relativePaths].sort()) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(gitBlobHash(relativePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function assertSection(markdown, heading) {
  if (!markdown.includes('\n## ' + heading + '\n')) {
    fail('MARKETPLACE.md is missing "## ' + heading + '"');
  }
}
function assertPackageMetadata() {
  const packageJson = readJson('package.json');
  if (packageJson.icon !== 'assets/icon.png')
    fail('package.json icon must point to assets/icon.png');
  if (packageJson.galleryBanner?.color !== '#1a1a2e')
    fail('package.json galleryBanner.color must stay #1a1a2e');
  if (packageJson.galleryBanner?.theme !== 'dark')
    fail('package.json galleryBanner.theme must stay dark');
  if (
    packageJson.scripts?.['marketplace:check'] !==
    'node scripts/check-marketplace-assets.js'
  ) {
    fail('package.json must expose marketplace:check');
  }
  if (
    packageJson.scripts?.['marketplace:capture'] !==
    'pnpm run build && playwright test --config playwright.marketplace.config.ts'
  ) {
    fail('package.json must expose the real-host marketplace:capture flow');
  }
  if (
    typeof packageJson.baseImagesUrl !== 'string' ||
    !packageJson.baseImagesUrl.startsWith(baseImageHost)
  ) {
    fail('package.json baseImagesUrl must point to raw.githubusercontent.com');
  }
  const packageScript = readText('scripts/package-extension.js');
  if (
    !packageScript.includes("'--readme-path'") ||
    !packageScript.includes("'MARKETPLACE.md'")
  ) {
    fail('extension packaging must use MARKETPLACE.md through --readme-path');
  }
}
function assertCaptureProvenance() {
  const contract = readJson('scripts/marketplace-capture-sources.json');
  const manifest = readJson('assets/screenshots/capture-manifest.json');
  if (contract.version !== 1 || !Array.isArray(contract.sources)) {
    fail('marketplace capture source contract is invalid');
  }
  for (const source of contract.sources) assertFile(source);
  if (manifest.schemaVersion !== 2)
    fail('capture manifest schemaVersion must be 2');
  if (manifest.fingerprintAlgorithm !== 'sha256(git-blob-id)') {
    fail('capture manifest fingerprint algorithm drifted');
  }
  if (manifest.captureMode !== 'real-vscode-extension-host') {
    fail(
      'marketplace screenshots must come from the real VS Code extension host'
    );
  }
  if (manifest.viewport?.width !== 1280 || manifest.viewport?.height !== 720) {
    fail('capture manifest viewport must be 1280x720');
  }
  if (manifest.theme !== 'Default Dark Modern')
    fail('capture manifest theme drifted');
  if (
    manifest.fixture !== 'test/fixtures/benchmark_projects/pass_i2c_sensor_hub'
  ) {
    fail('capture manifest must use the sanitized marketplace fixture');
  }
  if (manifest.sourceContractVersion !== contract.version)
    fail('capture manifest source contract version is stale');
  if (manifest.sourceFingerprint !== hashFiles(contract.sources)) {
    fail(
      'marketplace screenshots are stale: capture source fingerprint changed; rerun marketplace:capture'
    );
  }
  if (
    typeof manifest.kicadVersion !== 'string' ||
    manifest.kicadVersion === 'unknown'
  ) {
    fail('capture manifest must record the KiCad CLI version');
  }
  for (const screenshot of capturedScreenshots) {
    assertPng(screenshot, 1280, 720);
    const fileName = path.basename(screenshot);
    const expected = manifest.screenshots?.[fileName];
    const actual = contentFingerprint(screenshot);
    if (expected !== actual) {
      fail(
        screenshot +
          ' does not match capture-manifest.json; rerun marketplace:capture'
      );
    }
  }
}
function assertNoSyntheticProductAssets() {
  if (fileExistsInWorkingTree('scripts/generate_screenshots.py')) {
    fail('legacy synthetic screenshot generator must not exist');
  }
  for (const relativePath of obsoleteSyntheticAssets) {
    if (fileExistsInWorkingTree(relativePath)) {
      fail(
        'obsolete synthetic marketplace asset must be removed: ' + relativePath
      );
    }
  }
  const iconGenerator = readText('scripts/generate-icon.js');
  if (
    /screenshotsDir|createScreenshot|createQualityGatesScreenshot|assets\/screenshots/u.test(
      iconGenerator
    )
  ) {
    fail('generate-icon.js must not generate product screenshots');
  }
}
function assertMarketplaceMarkdown() {
  const packageJson = readJson('package.json');
  const marketplace = readText('MARKETPLACE.md');
  const repoReadme = readText('README.md');
  const baseImagesUrl = packageJson.baseImagesUrl.replace(/\/$/u, '');
  for (const heading of [
    'Quick Start',
    'What You Get',
    'Real Product Captures',
    'Requirements and Compatibility',
    'Privacy and Network Access',
    'License and Support'
  ]) {
    assertSection(marketplace, heading);
  }
  for (const forbidden of [
    'core-workflow.gif',
    'ai-assistant.png',
    'quality-gates.png',
    'component-search.png',
    'git-diff.png',
    'Marketplace Dry Run',
    'Local Development',
    'img.shields.io',
    '/actions/workflows/'
  ]) {
    if (marketplace.includes(forbidden)) {
      fail(
        'MARKETPLACE.md contains repo-maintainer or synthetic content: ' +
          forbidden
      );
    }
  }
  for (const screenshot of listingScreenshots) {
    const target = baseImagesUrl + '/' + screenshot;
    if (!marketplace.includes(target)) {
      fail('MARKETPLACE.md is missing real screenshot: ' + screenshot);
    }
  }
  const imagePattern = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
  let productImageCount = 0;
  for (const match of marketplace.matchAll(imagePattern)) {
    const target = match[1];
    if (!target || !target.startsWith(baseImagesUrl + '/')) {
      fail(
        'MARKETPLACE.md images must use package.json baseImagesUrl: ' + target
      );
    }
    const relative = target.slice((baseImagesUrl + '/').length);
    assertFile(relative);
    productImageCount += 1;
  }
  if (productImageCount !== listingScreenshots.length) {
    fail(
      'MARKETPLACE.md must contain exactly ' +
        listingScreenshots.length +
        ' authentic product screenshots; found ' +
        productImageCount
    );
  }
  if (/<details|<summary|<script|<style|<iframe/iu.test(marketplace)) {
    fail('MARKETPLACE.md uses unsupported Marketplace HTML');
  }
  if (
    repoReadme.includes('core-workflow.gif') ||
    repoReadme.includes('ai-assistant.png') ||
    repoReadme.includes('quality-gates.png')
  ) {
    fail('README.md still references removed synthetic marketplace media');
  }
}
function assertBrandAssets() {
  for (const asset of requiredSvgAssets) assertSvg(asset);
  assertPng('assets/marketplace/icon-128.png', 128, 128);
  assertPng('assets/marketplace/icon-256.png', 256, 256);
  assertPng('assets/marketplace/hero.png', 1280, 520);
}
assertPackageMetadata();
assertBrandAssets();
assertCaptureProvenance();
assertNoSyntheticProductAssets();
assertMarketplaceMarkdown();
console.log(
  'Marketplace check passed: 5 listing screenshots, 6 provenance-tracked captures, dedicated Marketplace copy, and no synthetic product UI.'
);
