const base = require('./jest.config');
const scope = require('./coverage-scope.json');

module.exports = {
  ...base,
  reporters: ['default'],
  coverageDirectory: 'coverage/critical',
  coverageReporters: ['json-summary', 'text'],
  collectCoverageFrom: scope.ratchet.files.map(
    (filePath) => `<rootDir>/${filePath}`
  ),
  testMatch: scope.ratchet.tests.map((testPath) => `<rootDir>/${testPath}`),
  coverageThreshold: {
    'src/activation/activationState.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100
    },
    'src/activation/studioContextController.ts': {
      statements: -16,
      branches: -42,
      functions: -3,
      lines: -16
    },
    'src/activation/workspaceContextController.ts': {
      statements: -59,
      branches: -31,
      functions: -5,
      lines: -59
    },
    'src/cli/exportCommands.ts': {
      statements: -344,
      branches: -259,
      functions: -49,
      lines: -340
    },
    'src/providers/baseKiCanvasEditorProvider.ts': {
      statements: -118,
      branches: -101,
      functions: -19,
      lines: -113
    },
    'src/providers/netlistViewProvider.ts': {
      statements: -30,
      branches: -32,
      functions: -10,
      lines: -30
    },
    'src/providers/projectTreeProvider.ts': {
      statements: -46,
      branches: -64,
      functions: -6,
      lines: -46
    },
    'src/providers/viewerHtml.ts': {
      statements: -4,
      branches: -11,
      functions: -1,
      lines: -4
    }
  }
};
