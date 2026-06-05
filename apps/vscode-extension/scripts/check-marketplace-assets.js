#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const maxScreenshotBytes = 2 * 1024 * 1024;
const maxGifBytes = 5 * 1024 * 1024;
const maxGifSeconds = 30;

const requiredSvgAssets = [
  'assets/marketplace/gallery-banner-background.svg',
  'assets/marketplace/gallery-banner-foreground.svg',
  'assets/marketplace/hero.svg'
];

const requiredScreenshots = [
  'assets/screenshots/project-tree.png',
  'assets/screenshots/schematic-viewer.png',
  'assets/screenshots/pcb-viewer.png',
  'assets/screenshots/drc-results.png',
  'assets/screenshots/mcp-tools-dashboard.png'
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

function readGifDurationSeconds(relativePath) {
  const { filePath } = assertFile(relativePath);
  const buffer = fs.readFileSync(filePath);
  const signature = buffer.subarray(0, 6).toString('ascii');
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    fail(`${relativePath} is not a GIF file`);
  }

  let totalCentiseconds = 0;
  for (let index = 0; index < buffer.length - 7; index += 1) {
    if (
      buffer[index] === 0x21 &&
      buffer[index + 1] === 0xf9 &&
      buffer[index + 2] === 0x04
    ) {
      totalCentiseconds += buffer.readUInt16LE(index + 4);
    }
  }

  return totalCentiseconds / 100;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function assertMarkdownSection(markdown, file, heading) {
  const pattern = new RegExp(`^## ${escapeRegExp(heading)}$`, 'mu');
  if (!pattern.test(markdown)) {
    fail(`${file} is missing "## ${heading}"`);
  }
}

function assertSvg(relativePath) {
  const svg = readText(relativePath);
  if (!svg.includes('<svg')) {
    fail(`${relativePath} is missing an <svg> root`);
  }
  if (!/\bwidth="[^"]+"/u.test(svg) || !/\bheight="[^"]+"/u.test(svg)) {
    fail(`${relativePath} must declare width and height`);
  }
  if (/\b(?:href|src)="https?:\/\//u.test(svg)) {
    fail(`${relativePath} must not depend on remote assets`);
  }
}

function assertPng(relativePath, expectedWidth, expectedHeight, maxBytes) {
  const { stat } = assertFile(relativePath);
  const size = readPngSize(relativePath);
  if (size.width !== expectedWidth || size.height !== expectedHeight) {
    fail(
      `${relativePath} is ${size.width}x${size.height}; expected ${expectedWidth}x${expectedHeight}`
    );
  }
  if (stat.size >= maxBytes) {
    fail(`${relativePath} is too large: ${stat.size} bytes`);
  }
}

function assertReadmeImageReferences(readme) {
  const imagePattern = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
  for (const match of readme.matchAll(imagePattern)) {
    const target = match[1];
    if (
      !target ||
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('data:') ||
      target.startsWith('#')
    ) {
      continue;
    }
    assertFile(target);
  }
}

function assertPackageMetadata() {
  const packageJson = readJson('package.json');
  if (packageJson.icon !== 'assets/icon.png') {
    fail('package.json icon must point to assets/icon.png');
  }
  if (packageJson.galleryBanner?.color !== '#1a1a2e') {
    fail('package.json galleryBanner.color must stay #1a1a2e');
  }
  if (packageJson.galleryBanner?.theme !== 'dark') {
    fail('package.json galleryBanner.theme must stay dark');
  }
  if (
    packageJson.scripts?.['marketplace:check'] !==
    'node scripts/check-marketplace-assets.js'
  ) {
    fail('package.json must expose marketplace:check');
  }
  if (!packageJson.baseImagesUrl) {
    fail('package.json must set baseImagesUrl for marketplace image rendering');
  }
  if (
    !packageJson.baseImagesUrl.startsWith('https://raw.githubusercontent.com/')
  ) {
    fail('package.json baseImagesUrl must point to raw.githubusercontent.com');
  }
}

function assertMarketplaceAssets() {
  for (const svgAsset of requiredSvgAssets) {
    assertSvg(svgAsset);
  }

  assertPng('assets/marketplace/icon-128.png', 128, 128, maxScreenshotBytes);
  assertPng('assets/marketplace/icon-256.png', 256, 256, maxScreenshotBytes);
  assertPng('assets/marketplace/hero.png', 1280, 520, maxScreenshotBytes);

  for (const screenshot of requiredScreenshots) {
    assertPng(screenshot, 1280, 720, maxScreenshotBytes);
  }

  const gif = assertFile('assets/marketplace/core-workflow.gif');
  if (gif.stat.size >= maxGifBytes) {
    fail(`assets/marketplace/core-workflow.gif is too large: ${gif.stat.size}`);
  }
  const duration = readGifDurationSeconds(
    'assets/marketplace/core-workflow.gif'
  );
  if (duration > maxGifSeconds) {
    fail(
      `assets/marketplace/core-workflow.gif is ${duration}s; expected <= ${maxGifSeconds}s`
    );
  }
}

function assertMarketplaceMarkdown() {
  const packageJson = readJson('package.json');
  const readme = readText('README.md');
  const listing = readText('docs/marketplace-listing.md');
  const firstLines = readme.split('\n').slice(0, 5).join('\n');
  const expectedVersion = packageJson.version;

  if (!firstLines.includes('assets/marketplace/hero.png')) {
    fail('README.md must place the hero image at the top');
  }

  // Version text in README must match package.json
  const versionPattern = new RegExp(
    `Version:\\s*\`${escapeRegExp(expectedVersion)}\``
  );
  if (!versionPattern.test(readme)) {
    fail(
      `README.md must declare Version: \`${expectedVersion}\` matching package.json`
    );
  }

  // MCP Compatibility section version
  const mcpCompatPattern = new RegExp(
    `KiCad Studio ${escapeRegExp(expectedVersion)}\\s+supports`
  );
  if (!mcpCompatPattern.test(readme)) {
    fail(
      `README.md MCP Compatibility section must reference KiCad Studio ${expectedVersion}`
    );
  }

  for (const heading of [
    'Quick Start',
    'Feature Matrix',
    'KiCad CLI-Only Comparison',
    'Support and Sponsorship'
  ]) {
    assertMarkdownSection(readme, 'README.md', heading);
  }
  for (const heading of ['Manual Review Checklist', 'English Listing Copy']) {
    assertMarkdownSection(listing, 'docs/marketplace-listing.md', heading);
  }
  if (/<details|<summary|<script|<style|<iframe/iu.test(readme)) {
    fail(
      'README.md uses Markdown/HTML that Marketplace renderers commonly strip'
    );
  }
  assertReadmeImageReferences(readme);
}

assertPackageMetadata();
assertMarketplaceAssets();
assertMarketplaceMarkdown();

console.log(
  `Marketplace asset check passed: ${requiredScreenshots.length} screenshots, 2 icon sizes, and one workflow GIF.`
);
