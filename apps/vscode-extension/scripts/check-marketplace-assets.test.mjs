import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { runMarketplaceCheck } = require('./check-marketplace-assets.js');
const originalReadFileSync = fs.readFileSync.bind(fs);
const originalExistsSync = fs.existsSync.bind(fs);

test('#710 marketplace checker validates the live repository contract', () => {
  assert.match(
    runMarketplaceCheck(),
    /5 listing screenshots, 6 provenance-tracked captures/iu
  );
});

test('#710 marketplace checker rejects package metadata drift', (context) => {
  mockTextFile(context, 'package.json', (original) => {
    const value = JSON.parse(original);
    value.icon = 'assets/wrong-icon.png';
    return JSON.stringify(value, null, 2) + '\n';
  });
  assert.throws(runMarketplaceCheck, /icon must point to assets\/icon\.png/iu);
});

test('#726 marketplace provenance ignores release-only version bumps', (context) => {
  mockTextFile(context, 'package.json', (original) => {
    const metadata = JSON.parse(original);
    metadata.version = '99.88.77';
    return JSON.stringify(metadata, null, 2) + '\n';
  });
  assert.match(
    runMarketplaceCheck(),
    /5 listing screenshots, 6 provenance-tracked captures/iu
  );
});

test('#726 marketplace provenance detects other package metadata drift', (context) => {
  mockTextFile(context, 'package.json', (original) => {
    const metadata = JSON.parse(original);
    metadata.displayName = 'Drifted Marketplace Name';
    return JSON.stringify(metadata, null, 2) + '\n';
  });
  assert.throws(runMarketplaceCheck, /capture source fingerprint changed/iu);
});

test('#710 marketplace checker rejects stale capture schema', (context) => {
  mockTextFile(
    context,
    'assets/screenshots/capture-manifest.json',
    (original) => {
      const value = JSON.parse(original);
      value.schemaVersion = 99;
      return JSON.stringify(value, null, 2) + '\n';
    }
  );
  assert.throws(runMarketplaceCheck, /schemaVersion must be 1/iu);
});

test('#710 marketplace checker rejects source-contract drift', (context) => {
  mockTextFile(
    context,
    'scripts/marketplace-capture-sources.json',
    (original) => {
      const value = JSON.parse(original);
      value.sources = value.sources.slice(1);
      return JSON.stringify(value, null, 2) + '\n';
    }
  );
  assert.throws(runMarketplaceCheck, /source contract drifted/iu);
});

test('#710 marketplace checker rejects screenshot fingerprint drift', (context) => {
  mockTextFile(
    context,
    'assets/screenshots/capture-manifest.json',
    (original) => {
      const value = JSON.parse(original);
      value.screenshots['project-tree.png'] = '0'.repeat(64);
      return JSON.stringify(value, null, 2) + '\n';
    }
  );
  assert.throws(runMarketplaceCheck, /does not match capture-manifest/iu);
});

test('#710 marketplace checker rejects missing listing sections', (context) => {
  mockTextFile(context, 'MARKETPLACE.md', (original) =>
    original.replace('## Quick Start', '## Start Here')
  );
  assert.throws(runMarketplaceCheck, /missing "## Quick Start"/iu);
});

test('#710 marketplace checker rejects repository-maintainer listing content', (context) => {
  mockTextFile(
    context,
    'MARKETPLACE.md',
    (original) => original + '\n![build](https://img.shields.io/example.svg)\n'
  );
  assert.throws(runMarketplaceCheck, /repo-maintainer or synthetic content/iu);
});

test('#710 marketplace checker rejects obsolete synthetic assets', (context) => {
  context.mock.method(fs, 'existsSync', (file) =>
    String(file)
      .replaceAll('\\', '/')
      .endsWith('assets/screenshots/quality-gates.png')
      ? true
      : originalExistsSync(file)
  );
  assert.throws(runMarketplaceCheck, /obsolete synthetic marketplace asset/iu);
});

function mockTextFile(context, relativePath, mutate) {
  context.mock.method(fs, 'readFileSync', (file, options) => {
    const current = originalReadFileSync(file, options);
    const normalized = String(file).replaceAll('\\', '/');
    if (
      normalized !== relativePath &&
      !normalized.endsWith('/' + relativePath)
    ) {
      return current;
    }

    const text = Buffer.isBuffer(current)
      ? current.toString('utf8')
      : String(current);
    const next = mutate(text);
    return Buffer.isBuffer(current) ? Buffer.from(next) : next;
  });
}
