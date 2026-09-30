import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { runMarketplaceCheck } = require('./check-marketplace-assets.js');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDir, '..');

test('#710 marketplace checker validates the live repository contract', () => {
  assert.match(
    runMarketplaceCheck(),
    /5 listing screenshots, 6 provenance-tracked captures/iu
  );
});

test('#710 marketplace checker rejects package metadata drift', () => {
  withJsonMutation(
    'package.json',
    (value) => {
      value.icon = 'assets/wrong-icon.png';
    },
    () => {
      assert.throws(
        runMarketplaceCheck,
        /icon must point to assets\/icon\.png/iu
      );
    }
  );
});

test('#710 marketplace checker rejects stale capture schema', () => {
  withJsonMutation(
    'assets/screenshots/capture-manifest.json',
    (value) => {
      value.schemaVersion = 99;
    },
    () => {
      assert.throws(runMarketplaceCheck, /schemaVersion must be 1/iu);
    }
  );
});

test('#710 marketplace checker rejects source-contract drift', () => {
  withJsonMutation(
    'scripts/marketplace-capture-sources.json',
    (value) => {
      value.sources = value.sources.slice(1);
    },
    () => {
      assert.throws(runMarketplaceCheck, /source contract drifted/iu);
    }
  );
});

test('#710 marketplace checker rejects screenshot fingerprint drift', () => {
  withJsonMutation(
    'assets/screenshots/capture-manifest.json',
    (value) => {
      value.screenshots['project-tree.png'] = '0'.repeat(64);
    },
    () => {
      assert.throws(runMarketplaceCheck, /does not match capture-manifest/iu);
    }
  );
});

test('#710 marketplace checker rejects missing listing sections', () => {
  withTextMutation(
    'MARKETPLACE.md',
    (value) => value.replace('## Quick Start', '## Start Here'),
    () => {
      assert.throws(runMarketplaceCheck, /missing "## Quick Start"/iu);
    }
  );
});

test('#710 marketplace checker rejects repository-maintainer listing content', () => {
  withTextMutation(
    'MARKETPLACE.md',
    (value) => value + '\n![build](https://img.shields.io/example.svg)\n',
    () => {
      assert.throws(
        runMarketplaceCheck,
        /repo-maintainer or synthetic content/iu
      );
    }
  );
});

test('#710 marketplace checker rejects obsolete synthetic assets', () => {
  const relativePath = 'assets/screenshots/quality-gates.png';
  const filePath = path.join(extensionRoot, relativePath);
  assert.equal(fs.existsSync(filePath), false);
  try {
    fs.writeFileSync(filePath, 'synthetic fixture', 'utf8');
    assert.throws(
      runMarketplaceCheck,
      /obsolete synthetic marketplace asset/iu
    );
  } finally {
    fs.rmSync(filePath, { force: true });
  }
});

function withJsonMutation(relativePath, mutate, assertion) {
  withTextMutation(
    relativePath,
    (original) => {
      const value = JSON.parse(original);
      mutate(value);
      return JSON.stringify(value, null, 2) + '\n';
    },
    assertion
  );
}

function withTextMutation(relativePath, mutate, assertion) {
  const filePath = path.join(extensionRoot, relativePath);
  const original = fs.readFileSync(filePath, 'utf8');
  try {
    fs.writeFileSync(filePath, mutate(original), 'utf8');
    assertion();
  } finally {
    fs.writeFileSync(filePath, original, 'utf8');
  }
}
