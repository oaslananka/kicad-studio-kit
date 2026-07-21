import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalLoad = Module._load;
let capturedOptions;

Module._load = function loadWithCodecovStub(request, parent, isMain) {
  if (request === '@codecov/webpack-plugin') {
    return {
      codecovWebpackPlugin(options) {
        capturedOptions = options;
        return { plugin: 'codecov-webpack-test-double' };
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let webpackConfig;
try {
  webpackConfig = require('../webpack.config.js');
} finally {
  Module._load = originalLoad;
}

function createPlugins(environment) {
  assert.equal(
    typeof webpackConfig.createPlugins,
    'function',
    'webpack config must export createPlugins(environment)'
  );
  capturedOptions = undefined;
  return webpackConfig.createPlugins(environment);
}

test('#514 normal builds exclude Codecov bundle analysis', () => {
  const plugins = createPlugins({});
  assert.equal(plugins.length, 1);
  assert.equal(capturedOptions, undefined);
});

test('#514 explicit GitHub opt-in configures tokenless stable bundle context', () => {
  const plugins = createPlugins({
    CODECOV_BUNDLE_ANALYSIS: 'true',
    CODECOV_BUNDLE_BRANCH: 'ci/514-codecov-bundle',
    CODECOV_BUNDLE_PR: '514',
    CODECOV_BUNDLE_SHA: '0123456789abcdef',
    CODECOV_BUNDLE_SLUG: 'oaslananka/kicad-studio-kit'
  });

  assert.equal(plugins.length, 2);
  assert.deepEqual(capturedOptions, {
    enableBundleAnalysis: true,
    bundleName: 'kicad-studio-vscode-extension',
    gitService: 'github',
    uploadOverrides: {
      branch: 'ci/514-codecov-bundle',
      pr: '514',
      sha: '0123456789abcdef',
      slug: 'oaslananka/kicad-studio-kit'
    },
    telemetry: false
  });
});

test('#514 a token without explicit opt-in does not enable analysis', () => {
  const plugins = createPlugins({
    CODECOV_TOKEN: 'test-only-token'
  });
  assert.equal(plugins.length, 1);
  assert.equal(capturedOptions, undefined);
});
