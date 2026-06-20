import * as vscode from 'vscode';
import { runManufacturingReleaseWizard } from '../../src/commands/manufacturingReleaseWizard';
import { window } from './vscodeMock';

describe('runManufacturingReleaseWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
