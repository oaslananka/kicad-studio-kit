import * as vscode from 'vscode';
import { CONTEXT_KEYS } from '../../src/constants';
import {
  WorkspaceContextController,
  type WorkspaceContextControllerDeps
} from '../../src/activation/workspaceContextController';
import { commands, workspace } from './vscodeMock';

jest.mock('../../src/workspace/projectContext', () => ({
  ...jest.requireActual('../../src/workspace/projectContext'),
  discoverKiCadProjects: jest.fn().mockResolvedValue([])
}));
jest.mock('../../src/utils/workspaceUtils', () => ({
  ...jest.requireActual('../../src/utils/workspaceUtils'),
  workspaceHasVariants: jest.fn().mockResolvedValue(false)
}));

describe('native walkthrough KiCad CLI context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
    (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    workspace.isTrusted = true;
  });

  for (const available of [true, false]) {
    it(
      'sets CLI step to ' +
        available +
        ' after actual workspace capability detection',
      async () => {
        const detected = available ? { version: '10.0.8' } : undefined;
        const deps = {
          context: { workspaceState: { get: jest.fn() } },
          projectState: {
            getActiveProject: jest.fn(),
            update: jest.fn().mockReturnValue({
              hasProject: false,
              hasVariants: false,
              activeProject: undefined
            })
          },
          diagnosticState: {
            setActiveProject: jest.fn(),
            getSnapshot: jest
              .fn()
              .mockReturnValue({ drc: undefined, erc: undefined })
          },
          statusBar: { update: jest.fn() },
          aiProviders: { getProvider: jest.fn().mockResolvedValue(undefined) },
          cliDetector: { detect: jest.fn().mockResolvedValue(detected) },
          importService: {
            isImportFormatSupported: jest.fn().mockResolvedValue(false)
          },
          activationState: {},
          logger: { error: jest.fn() }
        } as unknown as WorkspaceContextControllerDeps;
        const controller = new WorkspaceContextController(deps);
        await controller.refreshContexts();
        expect(deps.cliDetector.detect).toHaveBeenCalled();
        expect(commands.executeCommand).toHaveBeenCalledWith(
          'setContext',
          CONTEXT_KEYS.cliDetected,
          available
        );
        controller.dispose();
      }
    );
  }
});
