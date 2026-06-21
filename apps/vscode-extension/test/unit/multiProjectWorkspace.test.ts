import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  discoverKiCadProjects,
  findProjectForResource,
  pickActiveProject
} from '../../src/workspace/projectContext';
import {
  DiagnosticStateStore,
  ProjectStateStore,
  ViewerStateStore
} from '../../src/state/stateStores';
import type { ProjectContext } from '../../src/types';
import { resolveTargetFile } from '../../src/utils/workspaceUtils';
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Uri,
  window
} from './vscodeMock';

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

function writeProject(workspaceRoot: string, relativeRoot: string): string {
  const projectRoot = path.join(workspaceRoot, relativeRoot);
  const name = path.basename(projectRoot);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(path.join(projectRoot, `${name}.kicad_pro`), '{}', 'utf8');
  fs.writeFileSync(path.join(projectRoot, `${name}.kicad_sch`), '', 'utf8');
  fs.writeFileSync(path.join(projectRoot, `${name}.kicad_pcb`), '', 'utf8');
  return projectRoot;
}

function createDiagnostic(message: string): vscode.Diagnostic {
  const diagnostic = new Diagnostic(
    new Range(0, 0, 0, 1),
    message,
    DiagnosticSeverity.Error
  ) as unknown as vscode.Diagnostic;
  diagnostic.source = 'kicad-cli:drc';
  return diagnostic;
}

function byName(
  projects: readonly ProjectContext[],
  name: string
): ProjectContext {
  const project = projects.find((entry) => entry.name === name);
  if (!project) {
    throw new Error(`Missing project ${name}`);
  }
  return project;
}

describe('multi-project workspace state', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-multi-'));
  });

  afterEach(() => {
    window.activeTextEditor = undefined;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('discovers a deterministic four-project workspace', async () => {
    for (const project of ['alpha', 'beta', 'delta', 'gamma']) {
      writeProject(tempDir, project);
    }

    const projects = await discoverKiCadProjects([
      { uri: Uri.file(tempDir) }
    ] as never);

    expect(projects.map((project) => project.name)).toEqual([
      'alpha',
      'beta',
      'delta',
      'gamma'
    ]);
    expect(new Set(projects.map((project) => project.id)).size).toBe(4);
    expect(projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'alpha',
          projectFile: path.join(tempDir, 'alpha', 'alpha.kicad_pro'),
          rootPath: path.join(tempDir, 'alpha')
        })
      ])
    );
  });

  it('aggregates KiCad projects discovered across multiple workspace roots', async () => {
    // Mirrors the shipped `multi-root-workspace` fixture (controller + power-supply):
    // a multi-root workspace hands discoverKiCadProjects more than one workspace
    // folder, and discovery must aggregate projects from every distinct root.
    const controllerRoot = writeProject(tempDir, 'controller');
    const powerRoot = writeProject(tempDir, 'power-supply');

    const projects = await discoverKiCadProjects([
      { uri: Uri.file(controllerRoot) },
      { uri: Uri.file(powerRoot) }
    ] as never);

    expect(projects.map((project) => project.name)).toEqual([
      'controller',
      'power-supply'
    ]);
    expect(
      new Set(projects.map((project) => project.workspaceFolder)).size
    ).toBe(2);
    expect(
      findProjectForResource(
        projects,
        path.join(powerRoot, 'power-supply.kicad_pcb')
      )
    ).toEqual(expect.objectContaining({ name: 'power-supply' }));
  });

  it('resolves nested projects and firmware hardware folders to the nearest project', async () => {
    writeProject(tempDir, 'alpha');
    const nestedRoot = writeProject(tempDir, 'alpha/submodule/nested');
    const hardwareRoot = writeProject(tempDir, 'firmware/hardware');
    fs.mkdirSync(path.join(tempDir, 'firmware/src'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'firmware/src/main.c'),
      'int main(){}',
      'utf8'
    );

    const projects = await discoverKiCadProjects([
      { uri: Uri.file(tempDir) }
    ] as never);

    expect(
      findProjectForResource(
        projects,
        path.join(nestedRoot, 'nested.kicad_pcb')
      )
    ).toEqual(expect.objectContaining({ name: 'nested' }));
    expect(
      findProjectForResource(
        projects,
        path.join(hardwareRoot, 'hardware.kicad_sch')
      )
    ).toEqual(expect.objectContaining({ name: 'hardware' }));
    expect(
      findProjectForResource(
        projects,
        path.join(tempDir, 'firmware/src/main.c')
      )
    ).toBeUndefined();
  });

  it('targets the active project when live validation starts from another open project', async () => {
    const alphaRoot = writeProject(tempDir, 'alpha');
    const nestedRoot = writeProject(tempDir, 'alpha/submodule/nested');
    window.activeTextEditor = {
      document: {
        uri: Uri.file(path.join(nestedRoot, 'nested.kicad_pcb'))
      }
    } as never;

    await expect(
      resolveTargetFile(undefined, '.kicad_pcb', {
        projectRoot: alphaRoot
      })
    ).resolves.toBe(path.join(alphaRoot, 'alpha.kicad_pcb'));
  });

  it('restores persisted active project and falls back when that project closes', async () => {
    writeProject(tempDir, 'alpha');
    writeProject(tempDir, 'beta');
    writeProject(tempDir, 'gamma');
    const projects = await discoverKiCadProjects([
      { uri: Uri.file(tempDir) }
    ] as never);
    const beta = byName(projects, 'beta');

    expect(
      pickActiveProject(projects, {
        persistedActiveProjectId: beta.id
      })
    ).toEqual(expect.objectContaining({ name: 'beta' }));

    const remaining = projects.filter((project) => project.id !== beta.id);
    expect(
      pickActiveProject(remaining, {
        previousActiveProjectId: beta.id,
        persistedActiveProjectId: beta.id
      })
    ).toEqual(expect.objectContaining({ name: 'alpha' }));
  });

  it('keeps diagnostics isolated while two project validations finish out of order', async () => {
    const collection = createDiagnosticsCollection();
    const diagnostics = new DiagnosticStateStore(collection);
    const projectState = new ProjectStateStore();
    const alpha: ProjectContext = {
      id: 'project-alpha',
      name: 'alpha',
      rootPath: '/workspace/alpha',
      projectFile: '/workspace/alpha/alpha.kicad_pro',
      workspaceFolder: '/workspace'
    };
    const beta: ProjectContext = {
      id: 'project-beta',
      name: 'beta',
      rootPath: '/workspace/beta',
      projectFile: '/workspace/beta/beta.kicad_pro',
      workspaceFolder: '/workspace'
    };
    projectState.update({
      projects: [alpha, beta],
      activeProject: alpha,
      hasProject: true
    });
    diagnostics.setActiveProject(alpha.id);

    await Promise.all([
      Promise.resolve().then(() =>
        diagnostics.applyValidationResult(
          vscode.Uri.file('/workspace/beta/beta.kicad_pcb'),
          [createDiagnostic('Beta clearance')],
          {
            file: '/workspace/beta/beta.kicad_pcb',
            errors: 7,
            warnings: 0,
            infos: 0,
            source: 'drc'
          },
          { project: beta }
        )
      ),
      Promise.resolve().then(() =>
        diagnostics.applyValidationResult(
          vscode.Uri.file('/workspace/alpha/alpha.kicad_pcb'),
          [createDiagnostic('Alpha clearance')],
          {
            file: '/workspace/alpha/alpha.kicad_pcb',
            errors: 2,
            warnings: 0,
            infos: 0,
            source: 'drc'
          },
          { project: alpha }
        )
      )
    ]);

    expect(diagnostics.getSnapshot().drc?.errors).toBe(2);
    expect(diagnostics.getSnapshot({ projectId: alpha.id }).drc?.errors).toBe(
      2
    );
    expect(diagnostics.getSnapshot({ projectId: beta.id }).drc?.errors).toBe(7);

    diagnostics.setActiveProject(beta.id);
    expect(diagnostics.getSnapshot().drc?.errors).toBe(7);
    expect(diagnostics.getLatestDrcRun(alpha.id)?.summary.errors).toBe(2);
    expect(diagnostics.getLatestDrcRun(beta.id)?.summary.errors).toBe(7);
  });

  it('binds viewer surfaces to their owning project instead of the last active project', () => {
    const viewerState = new ViewerStateStore();
    const alpha: ProjectContext = {
      id: 'project-alpha',
      name: 'alpha',
      rootPath: '/workspace/alpha',
      projectFile: '/workspace/alpha/alpha.kicad_pro',
      workspaceFolder: '/workspace'
    };
    const beta: ProjectContext = {
      id: 'project-beta',
      name: 'beta',
      rootPath: '/workspace/beta',
      projectFile: '/workspace/beta/beta.kicad_pro',
      workspaceFolder: '/workspace'
    };

    viewerState.updateState(
      vscode.Uri.file('/workspace/alpha/alpha.kicad_pcb'),
      { zoom: 1.5, grid: true, theme: 'dark' },
      { project: alpha }
    );
    viewerState.updateState(
      vscode.Uri.file('/workspace/beta/beta.kicad_pcb'),
      { zoom: 0.75, grid: false, theme: 'light' },
      { project: beta }
    );

    expect(viewerState.getSnapshot().viewers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uri: '/workspace/alpha/alpha.kicad_pcb',
          project: expect.objectContaining({ id: 'project-alpha' }),
          state: expect.objectContaining({ zoom: 1.5 })
        }),
        expect.objectContaining({
          uri: '/workspace/beta/beta.kicad_pcb',
          project: expect.objectContaining({ id: 'project-beta' }),
          state: expect.objectContaining({ zoom: 0.75 })
        })
      ])
    );
  });
});
