import * as vscode from 'vscode';
import {
  ExportStateStore,
  type ExportStateSnapshot
} from '../../src/state/exportStateStore';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('export state store boundary', () => {
  it('starts empty and isolates returned snapshots from mutation', () => {
    const store = new ExportStateStore();
    expect(store.getSnapshot()).toEqual({ surfaces: [] });

    const resource = vscode.Uri.file('/workspace/board.kicad_pcb');
    const snapshot = store.begin('export', resource, 'Preparing export');
    expect(snapshot).toEqual({
      surfaces: [
        {
          kind: 'export',
          resource: resource.toString(),
          message: 'Preparing export',
          error: undefined,
          status: 'loading'
        }
      ]
    });

    snapshot.surfaces[0]!.message = 'mutated';
    snapshot.surfaces.push({
      kind: 'bom',
      resource: undefined,
      message: undefined,
      error: undefined,
      status: 'idle'
    });

    expect(store.getSnapshot()).toEqual({
      surfaces: [
        expect.objectContaining({
          kind: 'export',
          message: 'Preparing export',
          status: 'loading'
        })
      ]
    });
  });

  it('tracks independent export, BOM, and netlist lifecycle states', () => {
    const store = new ExportStateStore();
    const board = vscode.Uri.file('/workspace/board.kicad_pcb');
    const schematic = vscode.Uri.file('/workspace/design.kicad_sch');

    store.begin('export', board, 'Packing files');
    store.begin('bom', schematic, 'Reading components');
    store.complete('export', board, 'Archive ready');
    store.fail('bom', schematic, new Error('BOM generation failed'));
    store.complete('netlist', schematic);

    expect(store.getSnapshot()).toEqual({
      surfaces: [
        {
          kind: 'export',
          resource: board.toString(),
          message: 'Archive ready',
          error: undefined,
          status: 'ready'
        },
        {
          kind: 'bom',
          resource: schematic.toString(),
          message: 'Reading components',
          error: 'BOM generation failed',
          status: 'error'
        },
        {
          kind: 'netlist',
          resource: schematic.toString(),
          message: undefined,
          error: undefined,
          status: 'ready'
        }
      ]
    });
  });

  it('normalizes non-Error failures and clears stale errors on retry', () => {
    const store = new ExportStateStore();

    store.fail('export', undefined, 42);
    expect(store.getSnapshot().surfaces[0]).toEqual(
      expect.objectContaining({ error: '42', status: 'error' })
    );

    store.begin('export', undefined, 'Retrying');
    expect(store.getSnapshot().surfaces[0]).toEqual(
      expect.objectContaining({
        message: 'Retrying',
        error: undefined,
        status: 'loading'
      })
    );
  });

  it('redacts messages and errors only in diagnostic bundle snapshots', () => {
    const store = new ExportStateStore();
    store.begin('bom', undefined, 'Authorization: Bearer secret-token');
    store.fail('bom', undefined, 'password=raw-export-secret');

    const ordinary = store.getSnapshot();
    expect(ordinary.surfaces[0]?.message).toContain('secret-token');
    expect(ordinary.surfaces[0]?.error).toContain('raw-export-secret');

    const diagnostic = store.getDiagnosticBundleSnapshot();
    expect(diagnostic.surfaces[0]?.message).toContain('Bearer ***');
    expect(diagnostic.surfaces[0]?.error).toContain('password=***');
    expect(JSON.stringify(diagnostic)).not.toContain('secret-token');
    expect(JSON.stringify(diagnostic)).not.toContain('raw-export-secret');
  });

  it('preserves empty optional fields in diagnostic snapshots', () => {
    const store = new ExportStateStore();
    store.complete('netlist');

    expect(store.getDiagnosticBundleSnapshot()).toEqual({
      surfaces: [
        {
          kind: 'netlist',
          resource: undefined,
          message: undefined,
          error: undefined,
          status: 'ready'
        }
      ]
    });
  });

  it('publishes snapshots and disposes its event emitter', () => {
    const fire = jest.spyOn(vscode.EventEmitter.prototype, 'fire');
    const dispose = jest.spyOn(vscode.EventEmitter.prototype, 'dispose');
    const store = new ExportStateStore();

    const snapshot: ExportStateSnapshot = store.begin('netlist');
    expect(fire).toHaveBeenCalledWith(snapshot);

    store.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);

    fire.mockRestore();
    dispose.mockRestore();
  });
});
