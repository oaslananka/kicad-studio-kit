import * as fs from 'node:fs';
import * as path from 'node:path';

const EXTENSION_ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(EXTENSION_ROOT, 'package.json');
const README_PATH = path.join(EXTENSION_ROOT, 'README.md');
const LISTING_DOC_PATH = path.join(
  EXTENSION_ROOT,
  'docs',
  'marketplace-listing.md'
);

type PackageJson = {
  icon?: string;
  galleryBanner?: {
    color?: string;
    theme?: string;
  };
  scripts?: Record<string, string>;
};

type PngSize = {
  width: number;
  height: number;
};

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(EXTENSION_ROOT, relativePath), 'utf8');
}

function fileSize(relativePath: string): number {
  return fs.statSync(path.join(EXTENSION_ROOT, relativePath)).size;
}

function expectFile(relativePath: string): string {
  const absolutePath = path.join(EXTENSION_ROOT, relativePath);
  expect(fs.existsSync(absolutePath)).toBe(true);
  expect(fs.statSync(absolutePath).isFile()).toBe(true);
  return absolutePath;
}

function readPngSize(relativePath: string): PngSize {
  const absolutePath = expectFile(relativePath);
  const buffer = fs.readFileSync(absolutePath);
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function readGifDurationSeconds(relativePath: string): number {
  const absolutePath = expectFile(relativePath);
  const buffer = fs.readFileSync(absolutePath);
  const signature = buffer.subarray(0, 6).toString('ascii');
  expect(['GIF87a', 'GIF89a']).toContain(signature);

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

function expectMarkdownSection(markdown: string, heading: string): void {
  expect(markdown).toMatch(
    new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'mu')
  );
}

describe('marketplace listing assets', () => {
  it('declares marketplace-ready extension gallery metadata', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(PACKAGE_JSON_PATH, 'utf8')
    ) as PackageJson;

    expect(packageJson.icon).toBe('assets/icon.png');
    expect(packageJson.galleryBanner).toEqual({
      color: '#1a1a2e',
      theme: 'dark'
    });
    expect(packageJson.scripts?.['marketplace:check']).toBe(
      'node scripts/check-marketplace-assets.js'
    );
  });

  it('ships required banner, icon, animated workflow, and screenshot files', () => {
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

    for (const svgAsset of requiredSvgAssets) {
      const svg = readText(svgAsset);
      expect(svg).toContain('<svg');
      expect(svg).toMatch(/\bwidth="[^"]+"/u);
      expect(svg).toMatch(/\bheight="[^"]+"/u);
      expect(svg).not.toMatch(/\b(?:href|src)="https?:\/\//u);
    }

    expect(readPngSize('assets/marketplace/icon-128.png')).toEqual({
      width: 128,
      height: 128
    });
    expect(readPngSize('assets/marketplace/icon-256.png')).toEqual({
      width: 256,
      height: 256
    });
    expect(readPngSize('assets/marketplace/hero.png')).toEqual({
      width: 1280,
      height: 520
    });

    for (const screenshot of requiredScreenshots) {
      expect(readPngSize(screenshot)).toEqual({ width: 1280, height: 720 });
      expect(fileSize(screenshot)).toBeLessThan(2 * 1024 * 1024);
    }

    expect(fileSize('assets/marketplace/core-workflow.gif')).toBeLessThan(
      5 * 1024 * 1024
    );
    expect(
      readGifDurationSeconds('assets/marketplace/core-workflow.gif')
    ).toBeLessThanOrEqual(30);
  });

  it('documents Marketplace copy, review checklist, and Markdown-safe README polish', () => {
    const readme = fs.readFileSync(README_PATH, 'utf8');
    const listingDoc = fs.readFileSync(LISTING_DOC_PATH, 'utf8');

    expect(readme.split('\n').slice(0, 5).join('\n')).toContain(
      'assets/marketplace/hero.png'
    );
    expectMarkdownSection(readme, 'Quick Start');
    expectMarkdownSection(readme, 'Feature Matrix');
    expectMarkdownSection(readme, 'KiCad CLI-Only Comparison');
    expectMarkdownSection(readme, 'Release Notes');
    expectMarkdownSection(readme, 'Support and Sponsorship');
    expect(readme).toContain('assets/screenshots/project-tree.png');
    expect(readme).toContain('assets/screenshots/mcp-tools-dashboard.png');
    expect(readme).toContain(
      'https://open-vsx.org/extension/oaslananka/kicadstudiokit'
    );
    expect(readme).toContain('[CHANGELOG.md](CHANGELOG.md)');
    expect(readme).not.toMatch(/<details|<summary|<script|<style/iu);

    expectMarkdownSection(listingDoc, 'Manual Review Checklist');
    expectMarkdownSection(listingDoc, 'English Listing Copy');
    expectMarkdownSection(listingDoc, 'Turkish Listing Copy');
    expect(listingDoc).toContain('OASLANA-115');
  });
});
