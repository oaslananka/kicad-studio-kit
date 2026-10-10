import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const EXTENSION_ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(EXTENSION_ROOT, 'package.json');
const MARKETPLACE_PATH = path.join(EXTENSION_ROOT, 'MARKETPLACE.md');
const CAPTURE_MANIFEST_PATH = path.join(
  EXTENSION_ROOT,
  'assets',
  'screenshots',
  'capture-manifest.json'
);

type PackageJson = {
  icon?: string;
  galleryBanner?: {
    color?: string;
    theme?: string;
  };
  baseImagesUrl?: string;
  scripts?: Record<string, string>;
};

type CaptureManifest = {
  schemaVersion?: number;
  captureMode?: string;
  viewport?: { width?: number; height?: number };
  theme?: string;
  fixture?: string;
  sourceContractVersion?: number;
  sourceFingerprint?: string;
  kicadVersion?: string;
  screenshots?: Record<string, string>;
};

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(EXTENSION_ROOT, relativePath), 'utf8');
}
function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}
function expectFile(relativePath: string): string {
  const absolutePath = path.join(EXTENSION_ROOT, relativePath);
  expect(fs.existsSync(absolutePath)).toBe(true);
  expect(fs.statSync(absolutePath).isFile()).toBe(true);
  return absolutePath;
}
function readPngSize(relativePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(expectFile(relativePath));
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}
function sha256(relativePath: string): string {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(expectFile(relativePath)))
    .digest('hex');
}
function sourceFingerprint(sources: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const source of [...sources].sort((left, right) =>
    left.localeCompare(right)
  )) {
    hash.update(source);
    hash.update('\0');
    const content = fs.readFileSync(expectFile(source));
    if (source === 'package.json') {
      const packageMetadata = JSON.parse(content.toString('utf8')) as Record<
        string,
        unknown
      >;
      delete packageMetadata['version'];
      hash.update(JSON.stringify(packageMetadata));
    } else {
      hash.update(content);
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

describe('marketplace listing assets', () => {
  it('declares the real-host capture workflow and gallery metadata', () => {
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
    expect(packageJson.scripts?.['marketplace:capture']).toBe(
      'pnpm run build && playwright test --config playwright.marketplace.config.ts'
    );
  });

  it('tracks authentic captures with source and screenshot hashes', () => {
    const screenshots = [
      'project-tree.png',
      'schematic-viewer.png',
      'pcb-viewer.png',
      'drc-results.png',
      'bom-table.png',
      'mcp-tools-dashboard.png'
    ];
    const contract = readJson<{ version: number; sources: string[] }>(
      'scripts/marketplace-capture-sources.json'
    );
    const manifest = JSON.parse(
      fs.readFileSync(CAPTURE_MANIFEST_PATH, 'utf8')
    ) as CaptureManifest;

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.captureMode).toBe('real-vscode-extension-host');
    expect(manifest.viewport).toEqual({ width: 1280, height: 720 });
    expect(manifest.theme).toBe('Default Dark Modern');
    expect(manifest.fixture).toBe(
      'test/fixtures/benchmark_projects/pass_i2c_sensor_hub'
    );
    expect(contract.sources).toContain('media/styles/bom.css');
    expect(contract.sources).toContain(
      'src/providers/viewer/schematicFocusBounds.ts'
    );
    expect(contract.sources).toContain('package.nls.json');
    expect(manifest.sourceContractVersion).toBe(contract.version);
    expect(manifest.sourceFingerprint).toBe(
      sourceFingerprint(contract.sources)
    );
    expect(manifest.kicadVersion).toMatch(/10\.0\.6/u);

    for (const fileName of screenshots) {
      const relativePath = 'assets/screenshots/' + fileName;
      expect(readPngSize(relativePath)).toEqual({ width: 1280, height: 720 });
      expect(manifest.screenshots?.[fileName]).toBe(sha256(relativePath));
    }
  });

  it('uses focused Marketplace copy and removes synthetic product media', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(PACKAGE_JSON_PATH, 'utf8')
    ) as PackageJson;
    const marketplace = fs.readFileSync(MARKETPLACE_PATH, 'utf8');
    const packageScript = readText('scripts/package-extension.js');

    for (const heading of [
      '## Quick Start',
      '## What You Get',
      '## Real Product Captures',
      '## Requirements and Compatibility',
      '## Privacy and Network Access',
      '## License and Support'
    ]) {
      expect(marketplace).toContain(heading);
    }

    for (const screenshot of [
      'project-tree.png',
      'schematic-viewer.png',
      'pcb-viewer.png',
      'drc-results.png',
      'bom-table.png'
    ]) {
      expect(marketplace).toContain(
        packageJson.baseImagesUrl + '/assets/screenshots/' + screenshot
      );
    }

    expect(marketplace).not.toMatch(
      /img\.shields\.io|actions\/workflows|Local Development|Marketplace Dry Run/iu
    );
    expect(packageScript).toContain("'--readme-path'");
    expect(packageScript).toContain("'MARKETPLACE.md'");

    expect(
      fs.existsSync(
        path.join(EXTENSION_ROOT, 'scripts/generate_screenshots.py')
      )
    ).toBe(false);
    for (const relativePath of [
      'assets/marketplace/core-workflow.gif',
      'assets/screenshots/ai-assistant.png',
      'assets/screenshots/component-search.png',
      'assets/screenshots/git-diff.png',
      'assets/screenshots/quality-gates.png'
    ]) {
      expect(fs.existsSync(path.join(EXTENSION_ROOT, relativePath))).toBe(
        false
      );
    }

    const iconGenerator = readText('scripts/generate-icon.js');
    expect(iconGenerator).not.toMatch(
      /screenshotsDir|createScreenshot|createQualityGatesScreenshot/iu
    );
  });
});
