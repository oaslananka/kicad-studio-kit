import * as vscode from 'vscode';
import { ViewerStateStore } from '../../src/state/viewerStateStore';
import type { ProjectContext, ViewerState } from '../../src/types';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

function projectFixture(): ProjectContext {
  return {
    id: 'project-alpha',
    name: 'alpha',
    rootPath: '/workspace/alpha',
    projectFile: '/workspace/alpha/alpha.kicad_pro',
    workspaceFolder: '/workspace'
  };
}

function viewerFixture(): ViewerState {
  return {
    zoom: 2,
    grid: true,
    theme: 'dark',
    engine: {
      kind: 'kicanvas',
      label: 'KiCanvas',
      capabilities: {
        interactive: true,
        fit: true,
        zoom: true,
        exportPng: true,
        exportSvg: true,
        selection: true,
        layers: true
      }
    },
    selectedReference: 'U1',
    selectedArea: { x1: 1, y1: 2, x2: 3, y2: 4 },
    activeLayers: ['F.Cu', 'B.Cu']
  };
}

describe('viewer state store boundary', () => {
  it('deep-clones viewer state and project snapshots', () => {
    const store = new ViewerStateStore();
    const uri = vscode.Uri.file('/workspace/alpha/alpha.kicad_pcb');
    const project = projectFixture();
    const state = viewerFixture();

    store.updateState(uri, state, { project });

    project.name = 'mutated';
    state.engine!.capabilities.layers = false;
    state.selectedArea!.x1 = 99;
    state.activeLayers!.push('Edge.Cuts');

    const snapshot = store.getSnapshot();
    expect(snapshot.viewers[0]).toEqual(
      expect.objectContaining({
        uri: uri.toString(),
        project: expect.objectContaining({ name: 'alpha' }),
        state: expect.objectContaining({
          selectedArea: { x1: 1, y1: 2, x2: 3, y2: 4 },
          activeLayers: ['F.Cu', 'B.Cu'],
          engine: expect.objectContaining({
            capabilities: expect.objectContaining({ layers: true })
          })
        }),
        status: 'ready'
      })
    );

    snapshot.viewers[0]!.project!.name = 'snapshot-mutated';
    snapshot.viewers[0]!.state!.activeLayers!.push('Dwgs.User');
    expect(store.getSnapshot().viewers[0]).toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ name: 'alpha' }),
        state: expect.objectContaining({ activeLayers: ['F.Cu', 'B.Cu'] })
      })
    );
  });

  it('preserves state and project across reload while clearing and redacting errors', () => {
    const store = new ViewerStateStore();
    const uri = vscode.Uri.file('/workspace/alpha/alpha.kicad_pcb');
    const project = projectFixture();

    store.updateState(uri, viewerFixture(), { project });
    store.recordError(uri, new Error('Bearer secret-token failed'));

    expect(store.getDiagnosticBundleSnapshot().viewers[0]?.error).toBe(
      'Bearer *** failed'
    );

    const snapshot = store.beginReload(uri);
    expect(snapshot.viewers[0]).toEqual(
      expect.objectContaining({
        project,
        state: expect.objectContaining({ selectedReference: 'U1' }),
        error: undefined,
        status: 'loading'
      })
    );
  });

  it('publishes snapshots and disposes its event emitter', () => {
    const fire = jest.spyOn(vscode.EventEmitter.prototype, 'fire');
    const dispose = jest.spyOn(vscode.EventEmitter.prototype, 'dispose');
    const store = new ViewerStateStore();
    const uri = vscode.Uri.file('/workspace/alpha/alpha.kicad_pcb');

    const snapshot = store.updateState(uri, viewerFixture());
    expect(fire).toHaveBeenCalledWith(snapshot);

    store.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);

    fire.mockRestore();
    dispose.mockRestore();
  });
});
