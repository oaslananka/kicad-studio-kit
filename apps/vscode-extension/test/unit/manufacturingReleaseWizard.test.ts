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
});
