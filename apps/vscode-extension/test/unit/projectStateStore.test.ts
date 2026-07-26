import * as vscode from 'vscode';
import { ProjectStateStore } from '../../src/state/projectStateStore';
import type { ProjectContext } from '../../src/types';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

function projectFixture(id: string): ProjectContext {
  return {
    id,
    name: id,
    rootPath: `/workspace/${id}`,
    projectFile: `/workspace/${id}/${id}.kicad_pro`,
    workspaceFolder: '/workspace'
  };
}

describe('project state store boundary', () => {
  it('isolates retained and returned project contexts from mutation', () => {
    const store = new ProjectStateStore();
    expect(store.getActiveProject()).toBeUndefined();
    const alpha = projectFixture('alpha');
    const beta = projectFixture('beta');
    const projects = [alpha, beta];
    const activeResource = vscode.Uri.file('/workspace/alpha/alpha.kicad_pcb');

    store.update({
      activeResource,
      activeProject: alpha,
      projects,
      hasProject: true,
      hasVariants: true,
      workspaceTrusted: true
    });

    alpha.name = 'mutated';
    projects.push(projectFixture('gamma'));

    const snapshot = store.getSnapshot();
    expect(snapshot).toEqual({
      activeResource: activeResource.toString(),
      activeProject: expect.objectContaining({ id: 'alpha', name: 'alpha' }),
      projects: [
        expect.objectContaining({ id: 'alpha', name: 'alpha' }),
        expect.objectContaining({ id: 'beta', name: 'beta' })
      ],
      hasProject: true,
      hasVariants: true,
      workspaceTrusted: true
    });

    snapshot.activeProject!.name = 'snapshot-mutated';
    snapshot.projects[0]!.name = 'list-mutated';
    const returnedProjects = store.getProjects();
    returnedProjects[1]!.name = 'getter-mutated';

    expect(store.getActiveProject()?.name).toBe('alpha');
    expect(
      store.getProjects().map((project: ProjectContext) => project.name)
    ).toEqual(['alpha', 'beta']);
    expect(store.getDiagnosticBundleSnapshot()).toEqual(store.getSnapshot());
  });

  it('finds cloned projects by id and resource without leaking references', () => {
    const store = new ProjectStateStore();
    const alpha = projectFixture('alpha');
    const beta = projectFixture('beta');
    store.update({ projects: [alpha, beta], activeProject: alpha });

    const byId = store.findProjectById('beta');
    const byResource = store.findProjectForResource(
      vscode.Uri.file('/workspace/alpha/subsheet.kicad_sch')
    );

    expect(byId).toEqual(expect.objectContaining({ id: 'beta' }));
    expect(byResource).toEqual(expect.objectContaining({ id: 'alpha' }));
    expect(store.findProjectById(undefined)).toBeUndefined();
    expect(store.findProjectById('missing')).toBeUndefined();
    expect(store.findProjectForResource(undefined)).toBeUndefined();

    byId!.name = 'mutated';
    byResource!.name = 'mutated';
    expect(store.findProjectById('beta')?.name).toBe('beta');
    expect(
      store.findProjectForResource('/workspace/alpha/alpha.kicad_pcb')?.name
    ).toBe('alpha');
  });

  it('publishes snapshots and disposes its event emitter', () => {
    const fire = jest.spyOn(vscode.EventEmitter.prototype, 'fire');
    const dispose = jest.spyOn(vscode.EventEmitter.prototype, 'dispose');
    const store = new ProjectStateStore();

    const snapshot = store.update({ hasProject: true });
    expect(fire).toHaveBeenCalledWith(snapshot);

    store.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);

    fire.mockRestore();
    dispose.mockRestore();
  });
});
