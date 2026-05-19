module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/test/unit/vscodeMock.ts'
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/extension.ts',
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
  testMatch: ['**/*.test.ts']
};
