import {
  snapshotPath,
  type VisualCase,
  type VisualFixture
} from '../visual/visualThemeMatrix';

const fixture: VisualFixture = {
  id: 'renderer-failure',
  prepare: async () => undefined,
  platformSnapshots: ['win32']
};

const visualCase = {
  id: 'vscode-dark-1280x720'
} as VisualCase;

const testInfo = {
  project: { name: 'visual-dpr2' }
} as import('@playwright/test').TestInfo;

describe('visual snapshot paths', () => {
  it('uses a platform-specific baseline when the fixture opts in', () => {
    expect(snapshotPath(fixture, visualCase, testInfo, 'win32')).toEqual([
      'renderer-failure',
      'vscode-dark-1280x720-dpr2-win32.png'
    ]);
  });

  it('keeps the shared baseline when the platform is not opted in', () => {
    expect(snapshotPath(fixture, visualCase, testInfo, 'linux')).toEqual([
      'renderer-failure',
      'vscode-dark-1280x720-dpr2.png'
    ]);
  });
});
