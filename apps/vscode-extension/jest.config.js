const reporters = ['default'];

if (process.env.CI) {
  reporters.push([
    'jest-junit',
    {
      outputDirectory: 'test-results',
      outputName: 'junit.xml',
      addFileAttribute: 'true',
      reportTestSuiteErrors: 'true'
    }
  ]);
}

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  reporters,
  roots: ['<rootDir>/test'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/test/unit/vscodeMock.ts'
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['json-summary', 'text', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 88,
      lines: 83,
      statements: 83
    },
    'src/mcp/mcpClient.ts': {
      branches: 70,
      functions: 85,
      lines: 82,
      statements: 82
    }
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/extension.ts',
    '!src/activation/**/*.ts',
    '!src/cli/exportCommands.ts',
    '!src/providers/baseKiCanvasEditorProvider.ts',
    '!src/providers/bomViewProvider.ts',
    '!src/providers/diffEditorProvider.ts',
    '!src/providers/netlistViewProvider.ts',
    '!src/providers/projectTreeProvider.ts',
    '!src/providers/viewerHtml.ts',
    '!src/library/libraryIndexer.ts',
    '!src/library/librarySearchProvider.ts',
    '!src/tasks/**/*.ts'
  ],
  testMatch: [
    '<rootDir>/test/unit/**/*.test.ts',
    '<rootDir>/test/marketplace-assets.test.ts'
  ]
};
