jest.mock('../../src/boardreadyops/releaseGate', () => ({
  verifyBoardReadyOpsManufacturingRelease: jest.fn()
}));

import * as vscode from 'vscode';
import { runManufacturingReleaseWizard } from '../../src/commands/manufacturingReleaseWizard';
import { verifyBoardReadyOpsManufacturingRelease } from '../../src/boardreadyops/releaseGate';
import { window, __setConfiguration } from './vscodeMock';

describe('runManufacturingReleaseWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': false });
    (verifyBoardReadyOpsManufacturingRelease as jest.Mock).mockResolvedValue({
      ok: true,
      checkedArtifacts: 2,
      signatureVerified: true
    });
  });

  function createServices(overrides?: {
    runProjectQualityGate?: jest.Mock;
    exportManufacturingPackage?: jest.Mock;
  }) {
    return {
      context: {
        extensionUri: vscode.Uri.file('/extension')
      },
      variantProvider: {
        listVariants: jest.fn().mockResolvedValue([
          {
            name: 'Default',
            isDefault: true,
            componentOverrides: []
          }
        ])
      },
      mcpAdapter: {
        runProjectQualityGate:
          overrides?.runProjectQualityGate ?? jest.fn().mockResolvedValue([]),
        exportManufacturingPackage:
          overrides?.exportManufacturingPackage ??
          jest.fn().mockResolvedValue(undefined)
      },
      cliDetector: {
        detect: jest.fn().mockResolvedValue(undefined),
        getCapabilitySnapshot: jest.fn().mockResolvedValue(undefined)
      }
    };
  }

  it('handles project quality gate failures through wizard error handling', async () => {
    const services = createServices({
      runProjectQualityGate: jest
        .fn()
        .mockRejectedValue(new Error('quality gate failed'))
    });

    await expect(
      runManufacturingReleaseWizard(services as never)
    ).resolves.toBeUndefined();

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'quality gate failed',
      'Open Output Channel',
      'Re-run Wizard'
    );
    expect(
      services.mcpAdapter.exportManufacturingPackage
    ).not.toHaveBeenCalled();
  });

  it('previews the release in dry-run mode without exporting or writing', async () => {
    const services = createServices();
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce({
      label: 'Preview (dry run)',
      dryRun: true
    });
    (window.showInputBox as jest.Mock).mockResolvedValueOnce('release-out');

    await expect(
      runManufacturingReleaseWizard(services as never)
    ).resolves.toBeUndefined();

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Manufacturing release preview',
      expect.objectContaining({ modal: true }),
      'OK'
    );
    expect(
      services.mcpAdapter.exportManufacturingPackage
    ).not.toHaveBeenCalled();
  });

  it('blocks manufacturing release when BoardReadyOps readiness has blockers', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': true });
    (
      verifyBoardReadyOpsManufacturingRelease as jest.Mock
    ).mockResolvedValueOnce({
      ok: false,
      reason: 'BoardReadyOps readiness has blocking findings.'
    });
    const services = createServices();

    await runManufacturingReleaseWizard(services as never);

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'BoardReadyOps readiness has blocking findings.'
    );
    expect(
      services.mcpAdapter.exportManufacturingPackage
    ).not.toHaveBeenCalled();
  });

  it('includes verified BoardReadyOps evidence in the dry-run gate summary', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': true });
    const services = createServices();
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce({
      label: 'Preview (dry run)',
      dryRun: true
    });
    (window.showInputBox as jest.Mock).mockResolvedValueOnce(process.cwd());

    await runManufacturingReleaseWizard(services as never);

    expect(verifyBoardReadyOpsManufacturingRelease).toHaveBeenCalledWith(
      process.cwd(),
      undefined
    );
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Manufacturing release preview',
      expect.objectContaining({
        modal: true,
        detail: expect.stringContaining('BoardReadyOps=PASS')
      }),
      'OK'
    );
  });

  it('keeps BoardReadyOps optional for manufacturing release', async () => {
    const services = createServices();
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

    await runManufacturingReleaseWizard(services as never);

    expect(verifyBoardReadyOpsManufacturingRelease).not.toHaveBeenCalled();
  });

  it('blocks the release when a quality gate fails', async () => {
    const services = createServices({
      runProjectQualityGate: jest.fn().mockResolvedValue([
        {
          label: 'DRC',
          status: 'FAIL',
          summary: '2 errors',
          violations: []
        }
      ])
    });

    await runManufacturingReleaseWizard(services as never);

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('blocked by quality gates')
    );
    expect(
      services.mcpAdapter.exportManufacturingPackage
    ).not.toHaveBeenCalled();
  });
});
