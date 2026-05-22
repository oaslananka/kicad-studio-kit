import { COMMANDS } from '../../src/constants';
import { registerViewerCommands } from '../../src/commands/viewerCommands';
import type { PcmPackage } from '../../src/library/pcmService';
import { commands, window, workspace } from './vscodeMock';

describe('PCM command trust gates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
  });

  it('blocks PCM install, update, bulk update, and uninstall in restricted workspaces', async () => {
    const pcmService = {
      installPackage: jest.fn(),
      updatePackage: jest.fn(),
      updateAllPackages: jest.fn(),
      uninstallPackage: jest.fn()
    };
    const services = new Proxy(
      {
        pcmService,
        pcmLibraryProvider: {
          refresh: jest.fn(),
          pickFilter: jest.fn()
        }
      },
      {
        get(target, property) {
          if (property in target) {
            return target[property as keyof typeof target];
          }
          return jest.fn();
        }
      }
    );
    const pkg = createPcmPackage();

    registerViewerCommands(services as never);
    workspace.isTrusted = false;

    for (const command of [
      COMMANDS.installPcmPackage,
      COMMANDS.updatePcmPackage,
      COMMANDS.updateAllPcmPackages,
      COMMANDS.uninstallPcmPackage
    ]) {
      const handler = (commands.registerCommand as jest.Mock).mock.calls.find(
        ([registeredCommand]) => registeredCommand === command
      )?.[1] as ((target?: unknown) => Promise<void>) | undefined;
      expect(handler).toEqual(expect.any(Function));
      await handler?.(pkg);
    }

    expect(pcmService.installPackage).not.toHaveBeenCalled();
    expect(pcmService.updatePackage).not.toHaveBeenCalled();
    expect(pcmService.updateAllPackages).not.toHaveBeenCalled();
    expect(pcmService.uninstallPackage).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledTimes(4);
  });

  it('runs trusted PCM commands through the provider and service', async () => {
    const pcmService = {
      installPackage: jest.fn().mockResolvedValue(undefined),
      updatePackage: jest.fn().mockResolvedValue(undefined),
      updateAllPackages: jest.fn().mockResolvedValue([]),
      uninstallPackage: jest.fn().mockResolvedValue(undefined),
      refreshRepositories: jest.fn().mockResolvedValue([createPcmPackage()]),
      getPackages: jest.fn().mockReturnValue([createPcmPackage()])
    };
    const pcmLibraryProvider = {
      refresh: jest.fn().mockResolvedValue(undefined),
      pickFilter: jest.fn().mockResolvedValue(undefined)
    };
    const services = new Proxy(
      {
        pcmService,
        pcmLibraryProvider
      },
      {
        get(target, property) {
          if (property in target) {
            return target[property as keyof typeof target];
          }
          return jest.fn();
        }
      }
    );
    const pkg = createPcmPackage();

    registerViewerCommands(services as never);

    await handlerFor(COMMANDS.refreshPcmLibraries)?.();
    await handlerFor(COMMANDS.filterPcmLibraries)?.();
    await handlerFor(COMMANDS.installPcmPackage)?.(pkg);
    await handlerFor(COMMANDS.updatePcmPackage)?.(pkg);
    await handlerFor(COMMANDS.updateAllPcmPackages)?.();
    await handlerFor(COMMANDS.uninstallPcmPackage)?.(pkg);

    expect(pcmLibraryProvider.refresh).toHaveBeenCalled();
    expect(pcmLibraryProvider.pickFilter).toHaveBeenCalled();
    expect(pcmService.installPackage).toHaveBeenCalledWith(pkg);
    expect(pcmService.updatePackage).toHaveBeenCalledWith(pkg);
    expect(pcmService.updateAllPackages).toHaveBeenCalled();
    expect(pcmService.uninstallPackage).toHaveBeenCalledWith(pkg);
  });
});

function handlerFor(
  command: string
): ((target?: unknown) => Promise<void>) | undefined {
  return (commands.registerCommand as jest.Mock).mock.calls.find(
    ([registeredCommand]) => registeredCommand === command
  )?.[1] as ((target?: unknown) => Promise<void>) | undefined;
}

function createPcmPackage(): PcmPackage {
  return {
    repositoryId: 'fixture',
    repositoryName: 'Fixture Repository',
    repositoryUrl: 'file:///fixture/repository.json',
    metadata: {
      name: 'Precision Symbols',
      description: 'Precision analog symbol library',
      descriptionFull: '',
      identifier: 'com.example.precision-symbols',
      type: 'library',
      category: 'symbols',
      license: 'MIT',
      tags: ['precision'],
      resources: {},
      versions: [],
      raw: {}
    },
    latestVersion: {
      version: '1.0.0',
      versionEpoch: 0,
      status: 'stable',
      kicadVersion: '8.0',
      platforms: []
    },
    contentTypes: ['symbols'],
    state: 'available'
  };
}
