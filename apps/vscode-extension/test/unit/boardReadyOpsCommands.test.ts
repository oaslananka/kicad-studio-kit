jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import { COMMANDS } from '../../src/constants';
import { registerBoardReadyOpsCommands } from '../../src/commands/boardReadyOpsCommands';
import {
  commands,
  window,
  env,
  workspace,
  __setConfiguration
} from './vscodeMock';
import {
  boardReadyOpsAgentPlan,
  boardReadyOpsDoctorContract
} from './boardReadyOpsFixtures';

function registeredHandler(command: string): () => Promise<void> {
  const registration = (commands.registerCommand as jest.Mock).mock.calls.find(
    ([id]: [string]) => id === command
  );
  expect(registration).toBeDefined();
  return registration[1] as () => Promise<void>;
}

function boardReadyOpsChild(stdout: string, exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  queueMicrotask(() => {
    child.stdout.emit('data', Buffer.from(stdout));
    child.emit('close', exitCode);
  });
  return child;
}

describe('BoardReadyOps commands', () => {
  let servicesMock: any;
  let mockProjectState: any;
  let mockDiagnosticsCollection: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (childProcess.spawn as jest.Mock).mockReset();
    workspace.isTrusted = true;
    (window.withProgress as jest.Mock).mockImplementation(
      async (_options, task) =>
        task(
          { report: jest.fn() },
          {
            isCancellationRequested: false,
            onCancellationRequested: jest.fn(() => ({ dispose: jest.fn() }))
          }
        )
    );
    mockProjectState = {
      getActiveProject: jest.fn()
    };
    mockDiagnosticsCollection = {
      set: jest.fn(),
      setForSource: jest.fn()
    };
    mockLogger = {
      error: jest.fn(),
      info: jest.fn()
    };
    servicesMock = {
      projectState: mockProjectState,
      diagnosticsCollection: mockDiagnosticsCollection,
      logger: mockLogger
    };
  });

  function enableBoardReadyOpsProject(
    extraConfiguration: Record<string, unknown> = {}
  ): void {
    __setConfiguration({
      'kicadstudio.boardReadyOps.enabled': true,
      ...extraConfiguration
    });
    mockProjectState.getActiveProject.mockReturnValue({ rootPath: '/project' });
  }

  function mockCompatibleBoardReadyOpsResponse(
    response: unknown,
    exitCode = 0
  ): jest.Mock {
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock
      .mockImplementationOnce(() =>
        boardReadyOpsChild(JSON.stringify(boardReadyOpsDoctorContract()))
      )
      .mockImplementationOnce(() =>
        boardReadyOpsChild(
          typeof response === 'string' ? response : JSON.stringify(response),
          exitCode
        )
      );
    return spawnMock;
  }

  function readinessWithFindings(paths: string[]) {
    return {
      schemaVersion: 1,
      tool: { name: 'boardreadyops', version: '1.37.0' },
      status: 'failed',
      exitCode: 1,
      summary: {
        total: paths.length,
        critical: 0,
        high: paths.length,
        medium: 0,
        low: 0,
        info: 0
      },
      findings: paths.map((resourcePath, index) => ({
        ruleId: 'manufacturing.outputs-present',
        severity: 'high',
        message: 'A blocking finding',
        resource: { path: resourcePath, kind: 'pcb' },
        fingerprint: String(index).padStart(64, 'a')
      }))
    };
  }

  function mockReadinessAndEvidence(
    evidence: unknown,
    evidenceExitCode = 0
  ): jest.Mock {
    const readiness = {
      schemaVersion: 1,
      tool: { name: 'boardreadyops', version: '1.37.0' },
      status: 'passed',
      exitCode: 0,
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0
      },
      findings: []
    };
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock
      .mockImplementationOnce(() =>
        boardReadyOpsChild(JSON.stringify(boardReadyOpsDoctorContract()))
      )
      .mockImplementationOnce(() =>
        boardReadyOpsChild(JSON.stringify(readiness))
      )
      .mockImplementationOnce(() =>
        boardReadyOpsChild(JSON.stringify(boardReadyOpsDoctorContract()))
      )
      .mockImplementationOnce(() =>
        boardReadyOpsChild(JSON.stringify(evidence), evidenceExitCode)
      );
    return spawnMock;
  }

  async function runCommand(command: string): Promise<void> {
    registerBoardReadyOpsCommands(servicesMock);
    await registeredHandler(command)();
  }

  it.each([
    COMMANDS.boardReadyOpsCheck,
    COMMANDS.boardReadyOpsPlan,
    COMMANDS.boardReadyOpsShowReport
  ])(
    'blocks %s in Restricted Mode before any CLI execution',
    async (command) => {
      enableBoardReadyOpsProject();
      workspace.isTrusted = false;

      await runCommand(command);

      expect(childProcess.spawn).not.toHaveBeenCalled();
      expect(window.withProgress).not.toHaveBeenCalled();
      expect(window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('workspace')
      );
    }
  );

  it('registers five boardReadyOps commands', () => {
    const disposables = registerBoardReadyOpsCommands(servicesMock);

    expect(disposables).toHaveLength(5);

    const registeredIds = (
      commands.registerCommand as jest.Mock
    ).mock.calls.map(([id]: [string]) => id);

    expect(registeredIds).toContain(COMMANDS.boardReadyOpsCheck);
    expect(registeredIds).toContain(COMMANDS.boardReadyOpsPlan);
    expect(registeredIds).toContain(COMMANDS.boardReadyOpsConfigure);
    expect(registeredIds).toContain(COMMANDS.boardReadyOpsShowReport);
    expect(registeredIds).toContain(COMMANDS.boardReadyOpsOpenDocs);
  });

  it('shows a warning when boardReadyOps check is run while disabled', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': false });
    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsCheck
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showWarningMessage).toHaveBeenCalled();
  });

  it('shows an error when run with no active project', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': true });
    mockProjectState.getActiveProject.mockReturnValue(undefined);

    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsCheck
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('No active KiCad project')
    );
  });

  it('shows an info message when showReport is invoked and report not available', async () => {
    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsShowReport
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No BoardReadyOps report')
    );
  });

  it('does not show a previous project report after switching active projects', async () => {
    enableBoardReadyOpsProject();
    const spawnMock = mockReadinessAndEvidence({
      ok: true,
      checked: 1,
      errors: [],
      signature: { present: false, ok: true, errors: [] }
    });

    await runCommand(COMMANDS.boardReadyOpsCheck);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    (window.showInformationMessage as jest.Mock).mockClear();

    // The previous project's report must not become the new project's status.
    mockProjectState.getActiveProject.mockReturnValue({
      rootPath: '/different-project'
    });
    await runCommand(COMMANDS.boardReadyOpsShowReport);

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No BoardReadyOps report')
    );
    expect(window.showInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('BoardReadyOps Report:'),
      expect.anything()
    );
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('does not show a cached report when BoardReadyOps has been disabled', async () => {
    enableBoardReadyOpsProject();
    mockReadinessAndEvidence({
      ok: true,
      checked: 1,
      errors: [],
      signature: { present: false, ok: true, errors: [] }
    });
    await runCommand(COMMANDS.boardReadyOpsCheck);
    (window.showInformationMessage as jest.Mock).mockClear();

    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': false });
    await runCommand(COMMANDS.boardReadyOpsShowReport);

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No BoardReadyOps report')
    );
    expect(window.showInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('BoardReadyOps Report:'),
      expect.anything()
    );
  });

  it('does not expose the previous project report without an active project', async () => {
    enableBoardReadyOpsProject();
    mockReadinessAndEvidence({
      ok: true,
      checked: 1,
      errors: [],
      signature: { present: false, ok: true, errors: [] }
    });
    await runCommand(COMMANDS.boardReadyOpsCheck);
    (window.showInformationMessage as jest.Mock).mockClear();

    mockProjectState.getActiveProject.mockReturnValue(undefined);
    await runCommand(COMMANDS.boardReadyOpsShowReport);

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No BoardReadyOps report')
    );
  });

  it('discards a successful cached report before a failed rerun', async () => {
    enableBoardReadyOpsProject();
    mockReadinessAndEvidence({
      ok: true,
      checked: 1,
      errors: [],
      signature: { present: false, ok: true, errors: [] }
    });
    await runCommand(COMMANDS.boardReadyOpsCheck);
    (window.showInformationMessage as jest.Mock).mockClear();

    const spawnMock = childProcess.spawn as jest.Mock;
    spawnMock.mockReset();
    spawnMock.mockImplementationOnce(() =>
      boardReadyOpsChild(JSON.stringify(boardReadyOpsDoctorContract()), 2)
    );
    await runCommand(COMMANDS.boardReadyOpsCheck);
    await runCommand(COMMANDS.boardReadyOpsShowReport);

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('doctor exited with code 2')
    );
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No BoardReadyOps report')
    );
  });

  it('verifies local release evidence from the report without exposing manifest paths', async () => {
    enableBoardReadyOpsProject();
    const spawnMock = mockReadinessAndEvidence({
      ok: true,
      manifestPath: '/private/evidence/manifest.json',
      checked: 4,
      errors: [],
      signature: { present: true, ok: true, errors: [] }
    });

    await runCommand(COMMANDS.boardReadyOpsCheck);
    (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      'Verify Release Evidence'
    );
    await runCommand(COMMANDS.boardReadyOpsShowReport);

    expect(spawnMock.mock.calls[3]?.[1]).toEqual([
      'boardreadyops',
      'release',
      'verify',
      '--format',
      'json',
      path.join('/project', 'build', 'boardreadyops-release')
    ]);
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'BoardReadyOps release evidence verified: 4 artifact(s). Signature verified.'
    );
    expect(
      JSON.stringify((window.showInformationMessage as jest.Mock).mock.calls)
    ).not.toContain('/private/evidence/manifest.json');
  });

  it('never displays verified release evidence when the CLI returned a failure', async () => {
    enableBoardReadyOpsProject();
    mockReadinessAndEvidence(
      {
        ok: true,
        manifestPath: '/private/evidence/manifest.json',
        checked: 4,
        errors: [],
        signature: { present: true, ok: true, errors: [] }
      },
      1
    );

    await runCommand(COMMANDS.boardReadyOpsCheck);
    (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      'Verify Release Evidence'
    );
    await runCommand(COMMANDS.boardReadyOpsShowReport);

    expect(window.showInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('BoardReadyOps release evidence verified:')
    );
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'BoardReadyOps release verification failed: BoardReadyOps release verification returned inconsistent or incomplete evidence.'
    );
    expect(
      JSON.stringify((window.showErrorMessage as jest.Mock).mock.calls)
    ).not.toContain('/private/evidence/manifest.json');
  });

  it('summarizes failed evidence verification without exposing CLI error details', async () => {
    enableBoardReadyOpsProject();
    mockReadinessAndEvidence(
      {
        ok: false,
        manifestPath: '/private/evidence/manifest.json',
        checked: 2,
        errors: ['PRIVATE_EVIDENCE_SENTINEL: checksum mismatch'],
        signature: { present: false, ok: true, errors: [] }
      },
      1
    );

    await runCommand(COMMANDS.boardReadyOpsCheck);
    (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      'Verify Release Evidence'
    );
    await runCommand(COMMANDS.boardReadyOpsShowReport);

    const warningCalls = JSON.stringify(
      (window.showWarningMessage as jest.Mock).mock.calls
    );
    expect(warningCalls).toContain('release evidence is not verified');
    expect(warningCalls).not.toContain('PRIVATE_EVIDENCE_SENTINEL');
    expect(warningCalls).not.toContain('/private/evidence/manifest.json');
  });

  it('discovers the BoardReadyOps doctor contract before running readiness', async () => {
    enableBoardReadyOpsProject();
    const spawnMock = mockCompatibleBoardReadyOpsResponse({
      schemaVersion: 1,
      tool: { name: 'boardreadyops', version: '1.37.0' },
      status: 'passed',
      exitCode: 0,
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      findings: []
    });
    await runCommand(COMMANDS.boardReadyOpsCheck);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([
      'boardreadyops',
      'doctor',
      '--format',
      'json'
    ]);
    expect(spawnMock.mock.calls[1]?.[1]).toEqual([
      'boardreadyops',
      'run',
      '--format',
      'json',
      '/project'
    ]);
  });

  it('never reports success when the CLI fails but JSON claims a passing board', async () => {
    enableBoardReadyOpsProject();
    const spawnMock = mockCompatibleBoardReadyOpsResponse(
      {
        schemaVersion: 1,
        tool: { name: 'boardreadyops', version: '1.37.0' },
        status: 'passed',
        exitCode: 0,
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        findings: []
      },
      1
    );

    await runCommand(COMMANDS.boardReadyOpsCheck);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(mockDiagnosticsCollection.setForSource).not.toHaveBeenCalled();
    expect(window.showInformationMessage).not.toHaveBeenCalledWith(
      'BoardReadyOps: Board is ready! No issues found.'
    );
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'BoardReadyOps check failed: BoardReadyOps run returned inconsistent status or exit code.'
    );
  });

  it('renders valid project-local BoardReadyOps findings as diagnostics', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse(
      readinessWithFindings(['board.kicad_pcb']),
      1
    );

    await runCommand(COMMANDS.boardReadyOpsCheck);

    expect(mockDiagnosticsCollection.setForSource).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: path.resolve('/project', 'board.kicad_pcb')
      }),
      'other',
      expect.arrayContaining([
        expect.objectContaining({ source: 'boardreadyops' })
      ])
    );
  });

  it.each(['../private/evidence.kicad_pcb', '/private/evidence.kicad_pcb'])(
    'rejects an untrusted BoardReadyOps path %s without leaking it into diagnostics',
    async (badPath) => {
      enableBoardReadyOpsProject();
      mockCompatibleBoardReadyOpsResponse(
        readinessWithFindings(['board.kicad_pcb', badPath]),
        1
      );

      await runCommand(COMMANDS.boardReadyOpsCheck);

      expect(mockDiagnosticsCollection.setForSource).not.toHaveBeenCalled();
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'BoardReadyOps check failed: BoardReadyOps returned a finding outside the active project.'
      );
      expect(
        JSON.stringify((window.showErrorMessage as jest.Mock).mock.calls)
      ).not.toContain(badPath);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(
        badPath
      );
    }
  );

  it('rejects BoardReadyOps paths that escape via a symlink', async () => {
    const fixture = fs.mkdtempSync(
      path.join(os.tmpdir(), 'boardreadyops-guard-')
    );
    const project = path.join(fixture, 'project');
    const outside = path.join(fixture, 'outside');
    fs.mkdirSync(project);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(project, 'linked'), 'dir');
    try {
      enableBoardReadyOpsProject();
      mockProjectState.getActiveProject.mockReturnValue({ rootPath: project });
      mockCompatibleBoardReadyOpsResponse(
        readinessWithFindings(['linked/private.kicad_pcb']),
        1
      );

      await runCommand(COMMANDS.boardReadyOpsCheck);

      expect(mockDiagnosticsCollection.setForSource).not.toHaveBeenCalled();
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'BoardReadyOps check failed: BoardReadyOps returned a finding outside the active project.'
      );
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('fails closed when readiness JSON is structurally incomplete', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse(
      {
        schemaVersion: 1,
        tool: { name: 'boardreadyops', version: '1.37.0' },
        status: 'failed',
        summary: {
          total: 1,
          critical: 0,
          high: 1,
          medium: 0,
          low: 0,
          info: 0
        }
      },
      1
    );

    await runCommand(COMMANDS.boardReadyOpsCheck);

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('unsupported or incomplete readiness result')
    );
    expect(mockDiagnosticsCollection.setForSource).not.toHaveBeenCalled();
  });

  it('does not run the BoardReadyOps plan while integration is disabled', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': false });

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(childProcess.spawn).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalled();
  });

  it('does not run the BoardReadyOps plan without an active project', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': true });
    mockProjectState.getActiveProject.mockReturnValue(undefined);

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(childProcess.spawn).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('No active KiCad project')
    );
  });

  it('does not start contract discovery when plan execution is already cancelled', async () => {
    enableBoardReadyOpsProject();
    (window.withProgress as jest.Mock).mockImplementation(
      async (_options, task) =>
        task(
          { report: jest.fn() },
          {
            isCancellationRequested: true,
            onCancellationRequested: jest.fn(() => ({ dispose: jest.fn() }))
          }
        )
    );
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementationOnce(() =>
      boardReadyOpsChild(JSON.stringify(boardReadyOpsDoctorContract()))
    );

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(spawnMock).not.toHaveBeenCalled();
    expect(window.showQuickPick).not.toHaveBeenCalled();
  });

  it('stops after plan execution when cancellation arrives during the plan', async () => {
    enableBoardReadyOpsProject();
    let cancellationRead = 0;
    (window.withProgress as jest.Mock).mockImplementation(
      async (_options, task) =>
        task(
          { report: jest.fn() },
          {
            get isCancellationRequested() {
              cancellationRead += 1;
              return cancellationRead >= 6;
            },
            onCancellationRequested: jest.fn(() => ({ dispose: jest.fn() }))
          }
        )
    );
    const spawnMock = mockCompatibleBoardReadyOpsResponse(
      boardReadyOpsAgentPlan(),
      1
    );

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(window.showQuickPick).not.toHaveBeenCalled();
  });

  it.each([
    ['process failure but plan claims pass', 1, 0, 'passed'],
    ['process success but plan claims failure', 0, 1, 'failed'],
    ['plan JSON status contradicts exit code', 1, 1, 'passed']
  ])(
    'rejects contradictory BoardReadyOps plan verdict: %s',
    async (_label, code, jsonCode, status) => {
      enableBoardReadyOpsProject();
      const plan = boardReadyOpsAgentPlan();
      plan['exitCode'] = jsonCode;
      plan['status'] = status;
      const spawnMock = mockCompatibleBoardReadyOpsResponse(plan, code);

      await runCommand(COMMANDS.boardReadyOpsPlan);

      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(window.showQuickPick).not.toHaveBeenCalled();
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'BoardReadyOps plan failed: BoardReadyOps plan returned inconsistent status or exit code.'
      );
    }
  );

  it('passes the configured BoardReadyOps spec file to the plan command', async () => {
    enableBoardReadyOpsProject({
      'kicadstudio.boardReadyOps.specFile': 'boardreadyops.yaml'
    });
    const spawnMock = mockCompatibleBoardReadyOpsResponse(
      boardReadyOpsAgentPlan(),
      1
    );

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(spawnMock.mock.calls[1]?.[1]).toEqual([
      'boardreadyops',
      'plan',
      '--format',
      'json',
      '--config',
      'boardreadyops.yaml',
      '/project'
    ]);
  });

  it('closes progress before asking the user to review BoardReadyOps findings', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse(
      readinessWithFindings(['board.kicad_pcb']),
      1
    );
    let progressActive = false;
    (window.withProgress as jest.Mock).mockImplementation(
      async (_options, task) => {
        progressActive = true;
        try {
          return await task(
            { report: jest.fn() },
            {
              isCancellationRequested: false,
              onCancellationRequested: jest.fn(() => ({ dispose: jest.fn() }))
            }
          );
        } finally {
          progressActive = false;
        }
      }
    );
    (window.showWarningMessage as jest.Mock).mockImplementationOnce(
      async () => {
        expect(progressActive).toBe(false);
        return 'Show Problems';
      }
    );
    await runCommand(COMMANDS.boardReadyOpsCheck);
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Failed with 1 findings'),
      'Show Problems'
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'workbench.actions.view.problems'
    );
  });

  it('closes progress before showing the remediation QuickPick', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse(boardReadyOpsAgentPlan(), 1);
    let progressActive = false;
    (window.withProgress as jest.Mock).mockImplementation(
      async (_options, task) => {
        progressActive = true;
        try {
          return await task(
            { report: jest.fn() },
            {
              isCancellationRequested: false,
              onCancellationRequested: jest.fn(() => ({ dispose: jest.fn() }))
            }
          );
        } finally {
          progressActive = false;
        }
      }
    );
    (window.showQuickPick as jest.Mock).mockImplementationOnce(async () => {
      expect(progressActive).toBe(false);
      return undefined;
    });
    await runCommand(COMMANDS.boardReadyOpsPlan);
    expect(window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Generate missing manufacturing outputs.'
        })
      ]),
      expect.objectContaining({ title: 'BoardReadyOps Remediation Plan' })
    );
  });

  it('closes progress before displaying BoardReadyOps errors', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse('invalid json', 1);
    let progressActive = false;
    (window.withProgress as jest.Mock).mockImplementation(
      async (_options, task) => {
        progressActive = true;
        try {
          return await task(
            { report: jest.fn() },
            {
              isCancellationRequested: false,
              onCancellationRequested: jest.fn(() => ({ dispose: jest.fn() }))
            }
          );
        } finally {
          progressActive = false;
        }
      }
    );
    (window.showErrorMessage as jest.Mock).mockImplementationOnce(async () => {
      expect(progressActive).toBe(false);
      return undefined;
    });
    await runCommand(COMMANDS.boardReadyOpsCheck);
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('BoardReadyOps returned invalid JSON')
    );
  });

  it('shows the full selected remediation action in an inert plaintext preview', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse(boardReadyOpsAgentPlan(), 1);
    (window.showQuickPick as jest.Mock).mockImplementationOnce(
      async (items) => items[0]
    );
    const temporaryDocument = { uri: { scheme: 'untitled' } };
    (workspace.openTextDocument as jest.Mock).mockResolvedValueOnce(
      temporaryDocument
    );

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(workspace.openTextDocument).toHaveBeenCalledWith({
      language: 'plaintext',
      content: expect.stringContaining('Recommended steps:')
    });
    const args = (workspace.openTextDocument as jest.Mock).mock.calls[0][0];
    expect(args.content).toContain('Rule: manufacturing.outputs-present');
    expect(args.content).toContain('Run the KiCad jobset.');
    expect(args.content).toContain('Verification commands (not executed):');
    expect(args.content).toContain(
      'Advisory only: KiCad Studio has not changed any files'
    );
    expect(window.showTextDocument).toHaveBeenCalledWith(temporaryDocument, {
      preview: true
    });
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('keeps the remediation selection inert when the user dismisses QuickPick', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse(boardReadyOpsAgentPlan(), 1);
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(workspace.openTextDocument).not.toHaveBeenCalled();
    expect(window.showTextDocument).not.toHaveBeenCalled();
  });

  it('shows the structured BoardReadyOps remediation plan after contract discovery', async () => {
    enableBoardReadyOpsProject();
    const spawnMock = mockCompatibleBoardReadyOpsResponse(
      boardReadyOpsAgentPlan(),
      1
    );
    await runCommand(COMMANDS.boardReadyOpsPlan);
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([
      'boardreadyops',
      'doctor',
      '--format',
      'json'
    ]);
    expect(spawnMock.mock.calls[1]?.[1]).toEqual([
      'boardreadyops',
      'plan',
      '--format',
      'json',
      '/project'
    ]);
    expect(window.showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          label: 'Generate missing manufacturing outputs.',
          description: 'manufacturing.outputs-present',
          detail: 'Run the KiCad jobset.'
        })
      ],
      expect.objectContaining({ title: 'BoardReadyOps Remediation Plan' })
    );
  });

  it.each([
    {
      name: 'relative parent traversal',
      secret: '../private/secret.kicad_pcb',
      mutate: (plan: Record<string, unknown>) => {
        const action = (
          plan['nextActions'] as Array<Record<string, unknown>>
        )[0]!;
        (action['resource'] as Record<string, unknown>)['path'] =
          '../private/secret.kicad_pcb';
      }
    },
    {
      name: 'absolute external path',
      secret: '/private/secret.kicad_pcb',
      mutate: (plan: Record<string, unknown>) => {
        const action = (
          plan['nextActions'] as Array<Record<string, unknown>>
        )[0]!;
        (action['resource'] as Record<string, unknown>)['path'] =
          '/private/secret.kicad_pcb';
      }
    },
    {
      name: 'hidden release action',
      secret: '../private/release.json',
      mutate: (plan: Record<string, unknown>) => {
        const action = (
          plan['nextActions'] as Array<Record<string, unknown>>
        )[0]!;
        plan['releaseActions'] = [
          {
            ...action,
            resource: { path: '../private/release.json', kind: 'manifest' }
          }
        ];
      }
    },
    {
      name: 'different claimed project root',
      secret: '/private/another-project',
      mutate: (plan: Record<string, unknown>) => {
        plan['projectRoot'] = '/private/another-project';
      }
    }
  ])(
    'rejects BoardReadyOps plan $name without leaking paths',
    async ({ secret, mutate }) => {
      enableBoardReadyOpsProject();
      const plan = boardReadyOpsAgentPlan();
      mutate(plan);
      mockCompatibleBoardReadyOpsResponse(plan, 1);

      await runCommand(COMMANDS.boardReadyOpsPlan);

      expect(window.showQuickPick).not.toHaveBeenCalled();
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'BoardReadyOps plan failed: BoardReadyOps returned a path outside the active project.'
      );
      expect(
        JSON.stringify((window.showErrorMessage as jest.Mock).mock.calls)
      ).not.toContain(secret);
      expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(secret);
    }
  );

  it('rejects BoardReadyOps plan resource paths that escape through a project symlink', async () => {
    const fixture = fs.mkdtempSync(
      path.join(os.tmpdir(), 'boardreadyops-plan-')
    );
    const project = path.join(fixture, 'project');
    const outside = path.join(fixture, 'outside');
    fs.mkdirSync(project);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(project, 'linked'), 'dir');
    try {
      enableBoardReadyOpsProject();
      mockProjectState.getActiveProject.mockReturnValue({ rootPath: project });
      const plan = boardReadyOpsAgentPlan();
      plan['projectRoot'] = project;
      (
        (plan['nextActions'] as Array<Record<string, unknown>>)[0]![
          'resource'
        ] as Record<string, unknown>
      )['path'] = 'linked/private.json';
      mockCompatibleBoardReadyOpsResponse(plan, 1);

      await runCommand(COMMANDS.boardReadyOpsPlan);

      expect(window.showQuickPick).not.toHaveBeenCalled();
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'BoardReadyOps plan failed: BoardReadyOps returned a path outside the active project.'
      );
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('shows release actions when the remediation plan has no next actions', async () => {
    enableBoardReadyOpsProject();
    const plan = boardReadyOpsAgentPlan();
    const nextActions = plan['nextActions'] as unknown[];
    const action = nextActions[0];
    expect(action).toBeDefined();
    plan['nextActions'] = [];
    plan['releaseActions'] = [action];
    mockCompatibleBoardReadyOpsResponse(plan, 1);

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(window.showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          label: 'Generate missing manufacturing outputs.'
        })
      ],
      expect.any(Object)
    );
  });

  it('reports when the BoardReadyOps plan has no actions', async () => {
    enableBoardReadyOpsProject();
    const plan = boardReadyOpsAgentPlan();
    plan['nextActions'] = [];
    plan['releaseActions'] = [];
    mockCompatibleBoardReadyOpsResponse(plan, 1);

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(window.showQuickPick).not.toHaveBeenCalled();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining(
        'did not report any remediation or release actions'
      )
    );
  });

  it('uses a sanitized fallback for non-Error plan failures', async () => {
    enableBoardReadyOpsProject();
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock
      .mockImplementationOnce(() =>
        boardReadyOpsChild(JSON.stringify(boardReadyOpsDoctorContract()))
      )
      .mockImplementationOnce(() => {
        throw 'PRIVATE_NON_ERROR_SENTINEL';
      });

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'BoardReadyOps plan failed: Unknown BoardReadyOps plan error.'
    );
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(
      'PRIVATE_NON_ERROR_SENTINEL'
    );
  });

  it('fails closed when the BoardReadyOps plan exits unexpectedly', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse(boardReadyOpsAgentPlan(), 2);

    await runCommand(COMMANDS.boardReadyOpsPlan);

    expect(window.showQuickPick).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'BoardReadyOps plan failed: BoardReadyOps plan exited with code 2.'
    );
  });

  it('does not expose raw BoardReadyOps plan output when the plan is malformed', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse('PRIVATE_PLAN_EVIDENCE_SENTINEL');
    await runCommand(COMMANDS.boardReadyOpsPlan);
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('invalid JSON')
    );
    expect(window.showErrorMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('PRIVATE_PLAN_EVIDENCE_SENTINEL')
    );
    expect(mockLogger.error).toHaveBeenCalled();
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(
      'PRIVATE_PLAN_EVIDENCE_SENTINEL'
    );
  });

  it('fails closed on a partial BoardReadyOps plan contract without exposing its payload', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse(
      {
        schemaVersion: 1,
        tool: { name: 'boardreadyops', version: '1.37.0' },
        status: 'failed',
        nextActions: [
          {
            id: 'PRIVATE_PARTIAL_SENTINEL',
            ruleId: 'config.invalid',
            title: 'private action'
          }
        ],
        releaseActions: []
      },
      1
    );
    await runCommand(COMMANDS.boardReadyOpsPlan);
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'BoardReadyOps plan failed: BoardReadyOps plan returned an invalid contract.'
    );
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(
      'PRIVATE_PARTIAL_SENTINEL'
    );
  });

  it('does not expose raw BoardReadyOps output when readiness JSON is malformed', async () => {
    enableBoardReadyOpsProject();
    mockCompatibleBoardReadyOpsResponse('PRIVATE_EVIDENCE_SENTINEL');
    await runCommand(COMMANDS.boardReadyOpsCheck);
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('invalid JSON output')
    );
    expect(window.showErrorMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('PRIVATE_EVIDENCE_SENTINEL')
    );
    expect(mockLogger.error).toHaveBeenCalled();
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(
      'PRIVATE_EVIDENCE_SENTINEL'
    );
  });

  it('fails closed when BoardReadyOps doctor exits non-zero', async () => {
    enableBoardReadyOpsProject();
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementationOnce(() =>
      boardReadyOpsChild(JSON.stringify(boardReadyOpsDoctorContract()), 2)
    );

    await runCommand(COMMANDS.boardReadyOpsCheck);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('doctor exited with code 2')
    );
  });

  it('fails closed before readiness when the doctor contract is incompatible', async () => {
    __setConfiguration({ 'kicadstudio.boardReadyOps.enabled': true });
    mockProjectState.getActiveProject.mockReturnValue({ rootPath: '/project' });
    const spawnMock = childProcess.spawn as unknown as jest.Mock;
    spawnMock.mockImplementationOnce(() =>
      boardReadyOpsChild(
        JSON.stringify({
          schemaVersion: 2,
          tool: { name: 'boardreadyops', version: '1.37.0' },
          checks: []
        })
      )
    );

    registerBoardReadyOpsCommands(servicesMock);
    await registeredHandler(COMMANDS.boardReadyOpsCheck)();

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('not contract-compatible')
    );
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('opens BoardReadyOps docs via env.openExternal', async () => {
    (env.openExternal as jest.Mock).mockResolvedValue(true);

    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsOpenDocs
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(env.openExternal).toHaveBeenCalledTimes(1);
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('shows a fallback when boardReadyOps docs cannot be opened', async () => {
    (env.openExternal as jest.Mock).mockResolvedValue(false);

    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsOpenDocs
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(window.showWarningMessage).toHaveBeenCalled();
  });

  it('opens boardReadyOps settings when configure command is run', async () => {
    registerBoardReadyOpsCommands(servicesMock);

    const registration = (
      commands.registerCommand as jest.Mock
    ).mock.calls.find(
      ([command]: [string]) => command === COMMANDS.boardReadyOpsConfigure
    );
    const handler = registration?.[1] as () => Promise<void>;
    await handler();

    expect(commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      'kicadstudio.boardReadyOps'
    );
  });
});
