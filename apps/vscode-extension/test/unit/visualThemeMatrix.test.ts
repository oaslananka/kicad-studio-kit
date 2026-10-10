import {
  snapshotPath,
  type VisualCase,
  type VisualFixture
} from '../visual/visualThemeMatrix';

const fixture: VisualFixture = {
  id: 'viewer-final-renderer-failure-issue-625',
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
      'viewer-final-renderer-failure-issue-625',
      'vscode-dark-1280x720-dpr2-win32.png'
    ]);
  });

  it('uses the common baseline for Windows when no platform-specific evidence exists', () => {
    const otherFixture = { ...fixture, id: 'fixture-without-win32-evidence' };
    expect(snapshotPath(otherFixture, visualCase, testInfo, 'win32')).toEqual([
      'fixture-without-win32-evidence',
      'vscode-dark-1280x720-dpr2.png'
    ]);
  });

  it('uses CI-captured Windows text metrics for the BOM fixture when available', () => {
    const bomFixture = { ...fixture, id: 'bom-success' };
    expect(snapshotPath(bomFixture, visualCase, testInfo, 'win32')).toEqual([
      'bom-success',
      'vscode-dark-1280x720-dpr2-win32.png'
    ]);
  });

  it('keeps the shared baseline when the platform is not opted in', () => {
    expect(snapshotPath(fixture, visualCase, testInfo, 'linux')).toEqual([
      'viewer-final-renderer-failure-issue-625',
      'vscode-dark-1280x720-dpr2.png'
    ]);
  });
});
