import * as vscode from 'vscode';
import { DiagnosticStateStore } from '../../src/state/diagnosticStateStore';
import { KiCadDiagnosticsAggregator } from '../../src/language/diagnosticsAggregator';
import type { DiagnosticSummary, ProjectContext } from '../../src/types';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

function createDiagnosticsCollection(): vscode.DiagnosticCollection {
  return {
    name: 'kicad',
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    forEach: jest.fn(),
    get: jest.fn(),
    has: jest.fn(),
    dispose: jest.fn(),
    [Symbol.iterator]: jest.fn(() => [][Symbol.iterator]())
  } as unknown as vscode.DiagnosticCollection;
}

function projectFixture(id: string): ProjectContext {
  return {
    id,
    name: id,
    rootPath: `/workspace/${id}`,
    projectFile: `/workspace/${id}/${id}.kicad_pro`,
    workspaceFolder: '/workspace'
  };
}

function summaryFixture(
  source: DiagnosticSummary['source'],
  file: string,
  overrides: Partial<DiagnosticSummary> = {}
): DiagnosticSummary {
  return {
    file,
    errors: 0,
    warnings: 0,
    infos: 0,
    source,
    ...overrides
  };
}

function diagnosticFixture(
  message: string,
  source?: string
): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, 1),
    message,
    vscode.DiagnosticSeverity.Error
  );
  if (source) {
    diagnostic.source = source;
  }
  return diagnostic;
}

describe('diagnostic state store boundary', () => {
  function linkedErc(
    message: string,
    file: vscode.Uri,
    line: number
  ): vscode.Diagnostic {
    // The shared minimal VS Code Uri mock has no scheme property; native
    // vscode.Uri.file always returns scheme === 'file'.
    Object.defineProperty(file, 'scheme', { value: 'file' });
    const diagnostic = diagnosticFixture(message, 'kicad-cli:erc');
    diagnostic.code = 'power_pin_not_driven';
    diagnostic.relatedInformation = [
      {
        message: 'Exact KiCad source UUID location (open related information)',
        location: { uri: file, range: new vscode.Range(line, 4, line, 16) }
      }
    ];
    return diagnostic;
  }

  it('publishes the primary Problems entry at exact child source and preserves syntax', () => {
    const backing = createDiagnosticsCollection();
    const collection = new KiCadDiagnosticsAggregator(backing);
    const store = new DiagnosticStateStore(collection);
    const root = vscode.Uri.file('/workspace/alpha/root.kicad_sch');
    const child = vscode.Uri.file('/workspace/alpha/sch/Debugger.kicad_sch');
    const existingSyntax = diagnosticFixture(
      'S-expression warning',
      'kicad-studio:syntax'
    );
    collection.setForSource(child, 'syntax', [existingSyntax]);

    const issue = linkedErc('Unpowered pin', child, 41);
    store.applyValidationResult(
      root,
      [issue],
      summaryFixture('erc', root.fsPath, { errors: 1 }),
      { project: projectFixture('alpha') }
    );
    const atChild = collection.get(child) ?? [];
    expect(atChild.map((entry) => entry.message)).toEqual([
      'S-expression warning',
      'Unpowered pin'
    ]);
    expect(atChild[1]?.range.start.line).toBe(41);
    expect(atChild[1]?.code).toBe('power_pin_not_driven');
    expect(atChild[1]?.relatedInformation?.[0]?.location.uri.fsPath).toBe(
      child.fsPath
    );
    expect(collection.get(root)).toEqual([]);
    expect(store.getSnapshot({ projectId: 'alpha' }).erc?.errors).toBe(1);

    // Running the same root again must clear old child ERC entries without
    // deleting syntax diagnostics belonging to its own collection bucket.
    store.applyValidationResult(
      root,
      [diagnosticFixture('Root-only issue', 'kicad-cli:erc')],
      summaryFixture('erc', root.fsPath, { errors: 1 }),
      { project: projectFixture('alpha') }
    );
    expect(collection.get(root)?.map((entry) => entry.message)).toEqual([
      'Root-only issue'
    ]);
    expect(collection.get(child)?.map((entry) => entry.message)).toEqual([
      'S-expression warning'
    ]);
  });

  it('keeps ERC findings from two project roots sharing one child schematic isolated', () => {
    const collection = new KiCadDiagnosticsAggregator(
      createDiagnosticsCollection()
    );
    const store = new DiagnosticStateStore(collection);
    const alpha = vscode.Uri.file('/workspace/alpha/root.kicad_sch');
    const beta = vscode.Uri.file('/workspace/beta/root.kicad_sch');
    const child = vscode.Uri.file('/workspace/shared/Debugger.kicad_sch');
    store.applyValidationResult(
      alpha,
      [linkedErc('Alpha-only warning', child, 8)],
      summaryFixture('erc', alpha.fsPath, { warnings: 1 }),
      { project: projectFixture('alpha') }
    );
    store.applyValidationResult(
      beta,
      [linkedErc('Beta-only error', child, 12)],
      summaryFixture('erc', beta.fsPath, { errors: 1 }),
      { project: projectFixture('beta') }
    );
    expect(collection.get(child)?.map((entry) => entry.message)).toEqual([
      'Alpha-only warning',
      'Beta-only error'
    ]);
    store.applyValidationResult(
      alpha,
      [],
      summaryFixture('erc', alpha.fsPath),
      { project: projectFixture('alpha') }
    );
    expect(collection.get(child)?.map((entry) => entry.message)).toEqual([
      'Beta-only error'
    ]);
    expect(store.getSnapshot({ projectId: 'alpha' }).erc?.errors).toBe(0);
    expect(store.getSnapshot({ projectId: 'beta' }).erc?.errors).toBe(1);
  });

  it('marks distributed child ERC Problems stale when its schematic changes', () => {
    const collection = new KiCadDiagnosticsAggregator(
      createDiagnosticsCollection()
    );
    const store = new DiagnosticStateStore(collection);
    const root = vscode.Uri.file('/workspace/alpha/root.kicad_sch');
    const child = vscode.Uri.file('/workspace/alpha/sch/Debugger.kicad_sch');
    const issue = linkedErc('Needs power', child, 7);
    store.applyValidationResult(
      root,
      [issue],
      summaryFixture('erc', root.fsPath, {
        errors: 1,
        capturedAt: '2026-11-08T01:00:00.000Z'
      }),
      { project: projectFixture('alpha') }
    );
    store.markStaleForResource(child, 'child schematic edited', {
      project: projectFixture('alpha')
    });
    const stale = collection.get(child) ?? [];
    expect(stale).toHaveLength(1);
    expect(stale[0]?.message).toContain('[stale] Needs power');
    expect(stale[0]?.source).toContain(':stale');
    expect(stale[0]?.range.start.line).toBe(7);
    expect(store.getSnapshot({ projectId: 'alpha' }).erc?.freshness).toBe(
      'stale'
    );
    expect(
      store.getSnapshot({ projectId: 'alpha' }).erc?.lastGoodCapturedAt
    ).toBe('2026-11-08T01:00:00.000Z');
    expect(collection.get(root)).toEqual([]);
  });

  it('normalizes project-scoped DRC results and isolates summary arrays', () => {
    const collection = createDiagnosticsCollection();
    const store = new DiagnosticStateStore(collection);
    const project = projectFixture('alpha');
    const uri = vscode.Uri.file('/workspace/alpha/alpha.kicad_pcb');
    const commandArgs = ['pcb', 'drc'];
    const summary = summaryFixture('drc', uri.fsPath, {
      errors: 2,
      commandArgs,
      capturedAt: '2026-07-27T00:00:00.000Z'
    });

    store.applyValidationResult(
      uri,
      [diagnosticFixture('Clearance violation', 'kicad-cli:drc')],
      summary,
      { project }
    );
    commandArgs.push('--mutated');

    const snapshot = store.getSnapshot({ projectId: project.id });
    expect(snapshot.drc).toEqual(
      expect.objectContaining({
        fileUri: uri.toString(),
        projectId: project.id,
        projectName: project.name,
        origin: 'kicad-cli',
        freshness: 'fresh-dirty',
        commandArgs: ['pcb', 'drc']
      })
    );
    snapshot.drc!.commandArgs!.push('--snapshot-mutated');
    expect(
      store.getSnapshot({ projectId: project.id }).drc?.commandArgs
    ).toEqual(['pcb', 'drc']);
    expect(collection.set).toHaveBeenCalledWith(uri, [
      expect.objectContaining({ message: 'Clearance violation' })
    ]);
  });

  it('keeps project DRC/ERC state isolated and switches active scope', () => {
    const store = new DiagnosticStateStore(createDiagnosticsCollection());
    const alpha = projectFixture('alpha');
    const beta = projectFixture('beta');
    const alphaBoard = vscode.Uri.file('/workspace/alpha/alpha.kicad_pcb');
    const betaSchematic = vscode.Uri.file('/workspace/beta/beta.kicad_sch');

    store.applyValidationResult(
      alphaBoard,
      [],
      summaryFixture('drc', alphaBoard.fsPath),
      { project: alpha }
    );
    store.applyValidationResult(
      betaSchematic,
      [],
      summaryFixture('erc', betaSchematic.fsPath, { warnings: 3 }),
      { projectId: beta.id }
    );

    store.setActiveProject(alpha.id);
    expect(store.getSnapshot()).toMatchObject({
      activeProjectId: alpha.id,
      drc: { projectId: alpha.id, freshness: 'fresh-clean' },
      erc: undefined
    });

    store.setActiveProject(beta.id);
    expect(store.getSnapshot()).toMatchObject({
      activeProjectId: beta.id,
      drc: undefined,
      erc: { projectId: beta.id, freshness: 'fresh-dirty' }
    });
    expect(store.getSnapshot({ projectId: 'missing' })).toMatchObject({
      drc: undefined,
      erc: undefined
    });
    expect(store.getSnapshot().projects).toHaveLength(2);
  });

  it('records Error and non-Error failures without replacing Problems entries', () => {
    const collection = createDiagnosticsCollection();
    const store = new DiagnosticStateStore(collection);
    const board = vscode.Uri.file('/workspace/board.kicad_pcb');
    const schematic = vscode.Uri.file('/workspace/design.kicad_sch');

    store.applyValidationResult(
      board,
      [],
      summaryFixture('drc', board.fsPath, {
        capturedAt: '2026-07-27T00:00:00.000Z'
      })
    );
    store.recordValidationFailure('drc', board, new Error('DRC failed'));
    store.recordValidationFailure('erc', schematic, 42);

    expect(collection.set).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().drc).toEqual(
      expect.objectContaining({
        freshness: 'failed',
        failureMessage: 'DRC failed',
        lastGoodCapturedAt: '2026-07-27T00:00:00.000Z'
      })
    );
    expect(store.getSnapshot().erc).toEqual(
      expect.objectContaining({
        file: schematic.fsPath,
        freshness: 'failed',
        failureMessage: '42',
        lastGoodCapturedAt: undefined
      })
    );
  });

  it('marks PCB and schematic validations stale and ignores unrelated resources', () => {
    const collection = createDiagnosticsCollection();
    const store = new DiagnosticStateStore(collection);
    const board = vscode.Uri.file('/workspace/board.kicad_pcb');
    const schematic = vscode.Uri.file('/workspace/design.kicad_sch');

    store.applyValidationResult(
      board,
      [diagnosticFixture('Board violation')],
      summaryFixture('drc', board.fsPath, {
        capturedAt: '2026-07-27T00:00:00.000Z'
      })
    );
    store.applyValidationResult(
      schematic,
      [diagnosticFixture('Schematic violation', 'kicad-cli:erc')],
      summaryFixture('erc', schematic.fsPath, {
        capturedAt: '2026-07-27T00:01:00.000Z'
      })
    );

    store.markStaleForResource(board, 'board changed');
    store.markStaleForResource(schematic, 'schematic changed');
    const before = (collection.set as jest.Mock).mock.calls.length;
    const snapshot = store.markStaleForResource(
      vscode.Uri.file('/workspace/readme.txt'),
      'ignored'
    );

    expect(snapshot).toEqual(store.getSnapshot());
    expect(collection.set).toHaveBeenCalledTimes(before);
    expect(store.getSnapshot().drc).toEqual(
      expect.objectContaining({
        freshness: 'stale',
        staleReason: 'board changed',
        lastGoodCapturedAt: '2026-07-27T00:00:00.000Z'
      })
    );
    expect(store.getSnapshot().erc).toEqual(
      expect.objectContaining({
        freshness: 'stale',
        staleReason: 'schematic changed',
        lastGoodCapturedAt: '2026-07-27T00:01:00.000Z'
      })
    );
  });

  it('uses resource fallback for empty files and preserves syntax summaries outside DRC/ERC state', () => {
    const collection = createDiagnosticsCollection();
    const store = new DiagnosticStateStore(collection);
    const board = vscode.Uri.file('/workspace/fallback.kicad_pcb');
    const sourceFile = vscode.Uri.file('/workspace/source.kicad_sym');

    store.applyValidationResult(
      board,
      [],
      summaryFixture('drc', '', { freshness: 'fresh-clean' })
    );
    store.markValidationStale('drc', board, 'fallback path');
    store.applyValidationResult(
      sourceFile,
      [diagnosticFixture('Syntax issue')],
      summaryFixture('syntax', sourceFile.fsPath)
    );

    expect(store.getSnapshot().drc).toEqual(
      expect.objectContaining({
        file: board.fsPath,
        freshness: 'stale',
        origin: 'kicad-cli'
      })
    );
    expect(store.getSnapshot().erc).toBeUndefined();
    expect(collection.set).toHaveBeenLastCalledWith(sourceFile, [
      expect.objectContaining({ message: 'Syntax issue' })
    ]);
  });

  it('updates project-scoped failed and stale summaries without Problems entries', () => {
    const collection = createDiagnosticsCollection();
    const store = new DiagnosticStateStore(collection);
    const project = projectFixture('alpha');
    const board = vscode.Uri.file('/workspace/alpha/alpha.kicad_pcb');
    const schematic = vscode.Uri.file('/workspace/alpha/alpha.kicad_sch');

    store.applyValidationResult(
      schematic,
      [],
      summaryFixture('erc', schematic.fsPath, {
        capturedAt: '2026-07-27T00:02:00.000Z'
      }),
      { project }
    );
    store.markValidationStale('erc', schematic, 'schematic changed', {
      project
    });
    store.recordValidationFailure('drc', board, 'first failure', { project });
    store.recordValidationFailure('drc', board, 'second failure', { project });

    const snapshot = store.getSnapshot({ projectId: project.id });
    expect(snapshot.erc).toEqual(
      expect.objectContaining({
        freshness: 'stale',
        staleReason: 'schematic changed',
        lastGoodCapturedAt: '2026-07-27T00:02:00.000Z'
      })
    );
    expect(snapshot.drc).toEqual(
      expect.objectContaining({
        freshness: 'failed',
        failureMessage: 'second failure',
        lastGoodCapturedAt: undefined
      })
    );
    expect(collection.set).toHaveBeenCalledTimes(1);
  });

  it('preserves diagnostic metadata when cloning stale Problems entries', () => {
    const collection = createDiagnosticsCollection();
    const store = new DiagnosticStateStore(collection);
    const board = vscode.Uri.file('/workspace/board.kicad_pcb');
    const diagnostic = diagnosticFixture('Violation');
    diagnostic.code = 'DRC-1';
    diagnostic.relatedInformation = [{ message: 'related' }] as never;
    diagnostic.tags = [1 as vscode.DiagnosticTag];

    store.applyValidationResult(
      board,
      [diagnostic],
      summaryFixture('drc', board.fsPath)
    );
    store.markValidationStale('drc', board, 'source changed');

    const stale = (collection.set as jest.Mock).mock.calls.at(-1)?.[1]?.[0] as
      vscode.Diagnostic | undefined;
    expect(stale).toEqual(
      expect.objectContaining({
        code: 'DRC-1',
        source: 'kicad-cli:drc:stale',
        tags: [1],
        relatedInformation: [{ message: 'related' }]
      })
    );
    expect(stale?.tags).not.toBe(diagnostic.tags);
    expect(stale?.relatedInformation).not.toBe(diagnostic.relatedInformation);
  });

  it('does not emit stale state without a previous summary or Problems run', () => {
    const collection = createDiagnosticsCollection();
    const fire = jest.spyOn(vscode.EventEmitter.prototype, 'fire');
    const store = new DiagnosticStateStore(collection);
    const board = vscode.Uri.file('/workspace/board.kicad_pcb');

    const snapshot = store.markValidationStale('drc', board, 'no prior run');

    expect(snapshot).toEqual(store.getSnapshot());
    expect(collection.set).not.toHaveBeenCalled();
    expect(fire).not.toHaveBeenCalled();
    fire.mockRestore();
  });

  it('returns cloned latest DRC runs with active-project and global fallback', () => {
    const store = new DiagnosticStateStore(createDiagnosticsCollection());
    const project = projectFixture('alpha');
    const globalUri = vscode.Uri.file('/workspace/global.kicad_pcb');
    const projectUri = vscode.Uri.file('/workspace/alpha/alpha.kicad_pcb');

    store.applyValidationResult(
      globalUri,
      [diagnosticFixture('Global')],
      summaryFixture('drc', globalUri.fsPath, { commandArgs: ['global'] })
    );
    expect(store.getLatestDrcRun()?.file).toBe(globalUri.fsPath);
    store.applyValidationResult(
      projectUri,
      [diagnosticFixture('Project')],
      summaryFixture('drc', projectUri.fsPath, { commandArgs: ['project'] }),
      { project }
    );
    store.setActiveProject(project.id);

    const latest = store.getLatestDrcRun();
    expect(latest?.file).toBe(projectUri.fsPath);
    latest!.diagnostics.push(diagnosticFixture('Mutated'));
    latest!.summary.commandArgs!.push('mutated');
    expect(store.getLatestDrcRun()?.diagnostics).toHaveLength(1);
    expect(store.getLatestDrcRun()?.summary.commandArgs).toEqual(['project']);

    store.applyValidationResult(
      globalUri,
      [diagnosticFixture('Global latest')],
      summaryFixture('drc', globalUri.fsPath, {
        commandArgs: ['global-latest']
      })
    );
    store.setActiveProject('missing');
    expect(store.getLatestDrcRun()?.file).toBe(globalUri.fsPath);
    expect(store.getLatestDrcRun('missing')).toBeUndefined();
  });

  it('publishes snapshots and disposes its event emitter', () => {
    const fire = jest.spyOn(vscode.EventEmitter.prototype, 'fire');
    const dispose = jest.spyOn(vscode.EventEmitter.prototype, 'dispose');
    const store = new DiagnosticStateStore(createDiagnosticsCollection());

    const snapshot = store.setActiveProject('alpha');
    expect(fire).toHaveBeenCalledWith(snapshot);
    expect(store.getDiagnosticBundleSnapshot()).toEqual(store.getSnapshot());

    store.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    fire.mockRestore();
    dispose.mockRestore();
  });
});
