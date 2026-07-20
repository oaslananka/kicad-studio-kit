import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const webpackConfig = require('../webpack.config.js');

test('#511 normal builds exclude Codecov bundle analysis', () => {
  const plugins = webpackConfig.createPlugins({});
  assert.equal(plugins.length, 1);
});

test('#511 explicit CI opt-in adds one telemetry-disabled Codecov plugin', () => {
  const plugins = webpackConfig.createPlugins({
    CODECOV_BUNDLE_ANALYSIS: 'true',
    CODECOV_TOKEN: 'test-only-token'
  });
  assert.equal(plugins.length, 2);
});

test('#511 a token without the explicit opt-in does not enable analysis', () => {
  const plugins = webpackConfig.createPlugins({
    CODECOV_TOKEN: 'test-only-token'
  });
  assert.equal(plugins.length, 1);
});
