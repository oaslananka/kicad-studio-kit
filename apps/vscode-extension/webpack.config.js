const path = require('path');
const webpack = require('webpack');
const { codecovWebpackPlugin } = require('@codecov/webpack-plugin');

function createPlugins(environment = process.env) {
  const plugins = [
    new webpack.IgnorePlugin({
      resourceRegExp: /^@aws-sdk\/client-s3$/
    })
  ];

  const bundleAnalysisEnabled =
    environment.CODECOV_BUNDLE_ANALYSIS === 'true' &&
    typeof environment.CODECOV_TOKEN === 'string' &&
    environment.CODECOV_TOKEN.length > 0;

  if (bundleAnalysisEnabled) {
    plugins.push(
      codecovWebpackPlugin({
        enableBundleAnalysis: true,
        bundleName: 'kicad-studio-vscode-extension',
        uploadToken: environment.CODECOV_TOKEN,
        gitService: 'github',
        telemetry: false
      })
    );
  }

  return plugins;
}

const createWebpackConfig = (env, argv) => ({
  target: 'node',
  mode: argv.mode || 'development',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    chunkFilename: '[name].js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: argv.mode === 'production' ? false : 'source-map',
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            compilerOptions: {
              module: 'esnext'
            }
          }
        }
      }
    ]
  },
  plugins: createPlugins()
});

createWebpackConfig.createPlugins = createPlugins;
module.exports = createWebpackConfig;
