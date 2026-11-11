import * as vscode from 'vscode';
import {
  SaveCheckController,
  type SaveCheckControllerDeps
} from '../../src/activation/saveCheckController';
import { SETTINGS, COMMANDS } from '../../src/constants';
import { __setConfiguration, commands, window, workspace } from './vscodeMock';

describe('SaveCheckController repeated native DRC/ERC lifecycle', () => {
  const pcb = '/workspace/project/copper.kicad_pcb';
  const sch = '/workspace/project/schematic.kicad_sch';
  const project = { id: 'real-project', rootPath: '/workspace/project' };

  function build() {
    const checkService = {
      runDRC: jest.fn().mockResolvedValue({
        diagnostics: [{ message: 'Copper clearance' }],
        summary: { file: pcb, source: 'drc', errors: 1, warnings: 0, infos: 0 }
      }),
      runERC: jest.fn().mockResolvedValue({
        diagnostics: [{ message: 'Unpowered pin' }],
        summary: { file: sch, source: 'erc', errors: 1, warnings: 0, infos: 0 }
      })
    };
    const diagnosticState = {
      applyValidationResult: jest.fn(),
      recordValidationFailure: jest.fn()
    };
    const projectState = {
      findProjectForResource: jest.fn().mockReturnValue(project)
    };
    const qualityGateProvider = { scheduleDrcRefresh: jest.fn() };
    const aiProviders = { getProvider: jest.fn().mockResolvedValue(undefined) };
    const activationState: { latestDrcRun?: unknown } = {};
    const logger = { error: jest.fn() };
    const pushStudioContext = jest.fn().mockResolvedValue(undefined);
    const deps = {
      checkService,
      diagnosticState,
      projectState,
      qualityGateProvider,
      aiProviders,
      activationState,
      logger,
      pushStudioContext
    };
    return {
      controller: new SaveCheckController(
        deps as unknown as SaveCheckControllerDeps
      ),
      ...deps
    };
  }

  async function save(controller: SaveCheckController, name: string) {
    await controller.runConfiguredSaveChecks({
      fileName: name
    } as vscode.TextDocument);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
    __setConfiguration({});
  });

  afterEach(() => {
    workspace.isTrusted = true;
    __setConfiguration({});
  });

  it('focuses Problems on repeated automatic PCB DRC without toggling it closed', async () => {
    __setConfiguration({ [SETTINGS.autoRunDRC]: true });
    const state = build();
    await save(state.controller, pcb);
    await save(state.controller, pcb);
    expect(state.checkService.runDRC).toHaveBeenCalledTimes(2);
    expect(state.checkService.runERC).not.toHaveBeenCalled();
    expect(commands.executeCommand).toHaveBeenCalledTimes(2);
    expect(commands.executeCommand).toHaveBeenNthCalledWith(
      1,
      'workbench.action.problems.focus'
    );
    expect(commands.executeCommand).toHaveBeenNthCalledWith(
      2,
      'workbench.action.problems.focus'
    );
    expect(commands.executeCommand).not.toHaveBeenCalledWith(
      'workbench.actions.view.problems'
    );
    expect(state.qualityGateProvider.scheduleDrcRefresh).toHaveBeenCalledTimes(
      2
    );
    expect(state.pushStudioContext).toHaveBeenCalledWith('drc');
    expect(state.diagnosticState.applyValidationResult).toHaveBeenCalledWith(
      expect.anything(),
      [{ message: 'Copper clearance' }],
      expect.objectContaining({ source: 'drc' }),
      { project }
    );
    expect(state.activationState.latestDrcRun).toEqual(
      expect.objectContaining({ file: pcb })
    );
  });

  it('focuses Problems on repeated automatic schematic ERC without toggling', async () => {
    __setConfiguration({ [SETTINGS.autoRunERC]: true });
    const state = build();
    await save(state.controller, sch);
    await save(state.controller, sch);
    expect(state.checkService.runERC).toHaveBeenCalledTimes(2);
    expect(state.checkService.runDRC).not.toHaveBeenCalled();
    expect(commands.executeCommand).toHaveBeenCalledTimes(2);
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.problems.focus'
    );
    expect(state.diagnosticState.applyValidationResult).toHaveBeenCalledWith(
      expect.anything(),
      [{ message: 'Unpowered pin' }],
      expect.objectContaining({ source: 'erc' }),
      { project }
    );
    expect(state.pushStudioContext).not.toHaveBeenCalled();
    expect(state.qualityGateProvider.scheduleDrcRefresh).not.toHaveBeenCalled();
  });

  it('does not open Problems for a clean report', async () => {
    __setConfiguration({ [SETTINGS.autoRunERC]: true });
    const state = build();
    state.checkService.runERC.mockResolvedValue({
      diagnostics: [],
      summary: { file: sch, source: 'erc', errors: 0, warnings: 0, infos: 0 }
    });
    await save(state.controller, sch);
    expect(state.diagnosticState.applyValidationResult).toHaveBeenCalled();
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('does not run checks when disabled or document is unrelated', async () => {
    const state = build();
    await save(state.controller, pcb);
    await save(state.controller, sch);
    __setConfiguration({ [SETTINGS.autoRunERC]: true });
    await save(state.controller, '/workspace/project/readme.md');
    expect(state.checkService.runDRC).not.toHaveBeenCalled();
    expect(state.checkService.runERC).not.toHaveBeenCalled();
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('preserves workspace-trust denial and never invokes native CLI', async () => {
    __setConfiguration({
      [SETTINGS.autoRunDRC]: true,
      [SETTINGS.autoRunERC]: true
    });
    workspace.isTrusted = false;
    const state = build();
    await save(state.controller, pcb);
    await save(state.controller, sch);
    expect(state.checkService.runDRC).not.toHaveBeenCalled();
    expect(state.checkService.runERC).not.toHaveBeenCalled();
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('records and reports failed automatic checks without fabricating success', async () => {
    __setConfiguration({ [SETTINGS.autoRunERC]: true });
    const state = build();
    const error = new Error('KiCad CLI exited');
    state.checkService.runERC.mockRejectedValue(error);
    await save(state.controller, sch);
    expect(state.diagnosticState.recordValidationFailure).toHaveBeenCalledWith(
      'erc',
      expect.anything(),
      error,
      { project }
    );
    expect(state.logger.error).toHaveBeenCalledWith(
      'Auto DRC/ERC on save failed',
      error
    );
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('KiCad CLI exited')
    );
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('preserves explicit AI opt-in after an automatic DRC', async () => {
    __setConfiguration({ [SETTINGS.autoRunDRC]: true });
    const state = build();
    state.aiProviders.getProvider.mockResolvedValue({
      isConfigured: () => true
    });
    (window.showInformationMessage as jest.Mock).mockResolvedValue(
      'Yes, analyze'
    );
    await save(state.controller, pcb);
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('DRC: 1 errors found'),
      'Yes, analyze',
      'No'
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(
      COMMANDS.aiProactiveDRC
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.problems.focus'
    );
  });
});
