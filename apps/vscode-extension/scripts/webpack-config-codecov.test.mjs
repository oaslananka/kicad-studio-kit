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

test('#845 Codecov bundle options remain compatible with patched Zod 4', () => {
  const codecovRequire = createRequire(
    require.resolve('@codecov/webpack-plugin')
  );
  const coreEntry = codecovRequire.resolve('@codecov/bundler-plugin-core');
  const coreRequire = createRequire(coreEntry);
  const zodVersion = coreRequire('zod/package.json').version;
  assert.match(zodVersion, /^4\./u);

  const { normalizeOptions, handleErrors } = codecovRequire(
    '@codecov/bundler-plugin-core'
  );
  createPlugins({
    CODECOV_BUNDLE_ANALYSIS: 'true',
    CODECOV_BUNDLE_BRANCH: 'security/test',
    CODECOV_BUNDLE_PR: '845',
    CODECOV_BUNDLE_SHA: '0123456789abcdef',
    CODECOV_BUNDLE_SLUG: 'oaslananka/kicad-studio-kit'
  });
  const accepted = normalizeOptions(capturedOptions);
  assert.equal(accepted.success, true);

  const rejected = normalizeOptions({
    ...capturedOptions,
    gitService: 'invalid'
  });
  assert.equal(rejected.success, false);
  assert.ok(Array.isArray(rejected.errors));
  assert.ok(rejected.errors.some((error) => error.includes('Invalid option')));
  // The plugin converts ZodError.issues to an array before handleErrors.
  const originalLog = console.log;
  try {
    console.log = () => {};
    assert.doesNotThrow(() => handleErrors(rejected));
  } finally {
    console.log = originalLog;
  }
});

test('#845 patched Zod 4 keeps real Codecov bundle option validation operational', () => {
  // The Codecov core package declares Zod ^3, while the reviewed workspace
  // security override resolves the patched Zod 4 line. Exercise its actual
  // validator and plugin factory, not the test double above.
  const pluginRequire = createRequire(
    require.resolve('@codecov/webpack-plugin')
  );
  const codecovCore = pluginRequire('@codecov/bundler-plugin-core');
  const { codecovWebpackPlugin } = require('@codecov/webpack-plugin');
  const config = {
    enableBundleAnalysis: true,
    bundleName: 'kicad-studio-vscode-extension',
    gitService: 'github',
    uploadOverrides: {
      branch: 'security-validation',
      pr: '845',
      sha: 'a'.repeat(40),
      slug: 'oaslananka/kicad-studio-kit'
    },
    telemetry: false
  };

  const parsed = codecovCore.normalizeOptions(config);
  assert.equal(parsed.success, true);
  assert.equal(parsed.options.bundleName, config.bundleName);
  assert.equal(parsed.options.telemetry, false);
  assert.deepEqual(parsed.options.uploadOverrides, config.uploadOverrides);

  // Instantiating the plugin does not run Webpack, perform network I/O or
  // upload a report. It verifies that the real factory accepts the config.
  assert.equal(typeof codecovWebpackPlugin(config).apply, 'function');

  const badName = codecovCore.normalizeOptions({
    ...config,
    bundleName: 'invalid name with spaces'
  });
  assert.equal(badName.success, false);
  assert.match(badName.errors.join(' '), /bundleName/iu);

  const badUpload = codecovCore.normalizeOptions({
    ...config,
    uploadOverrides: { ...config.uploadOverrides, slug: 123 }
  });
  assert.equal(badUpload.success, false);
  assert.ok(badUpload.errors.length > 0);

  const badApi = codecovCore.normalizeOptions({
    ...config,
    apiUrl: 'not-a-url'
  });
  assert.equal(badApi.success, false);
  assert.match(badApi.errors.join(' '), /apiUrl/iu);
});
