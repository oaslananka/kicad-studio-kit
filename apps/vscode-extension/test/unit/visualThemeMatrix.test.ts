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

  it('selects verified Windows viewer screenshots without changing shared baselines', () => {
    const viewerFixture = {
      ...fixture,
      id: 'clean-pcb-issue-18-toolbar-issue-19-collapsed-panel'
    };
    const windowsEvidenceCase = { ...visualCase, id: 'vscode-light-1280x720' };
    expect(
      snapshotPath(viewerFixture, windowsEvidenceCase, testInfo, 'win32')
    ).toEqual([
      'clean-pcb-issue-18-toolbar-issue-19-collapsed-panel',
      'vscode-light-1280x720-dpr2-win32.png'
    ]);
    // Missing Windows-specific evidence must preserve the shared strict baseline.
    expect(snapshotPath(viewerFixture, visualCase, testInfo, 'win32')).toEqual([
      'clean-pcb-issue-18-toolbar-issue-19-collapsed-panel',
      'vscode-dark-1280x720-dpr2.png'
    ]);
    expect(
      snapshotPath(viewerFixture, windowsEvidenceCase, testInfo, 'linux')
    ).toEqual([
      'clean-pcb-issue-18-toolbar-issue-19-collapsed-panel',
      'vscode-light-1280x720-dpr2.png'
    ]);
  });

  it('keeps the shared baseline when the platform is not opted in', () => {
    expect(snapshotPath(fixture, visualCase, testInfo, 'linux')).toEqual([
      'viewer-final-renderer-failure-issue-625',
      'vscode-dark-1280x720-dpr2.png'
    ]);
  });
});
