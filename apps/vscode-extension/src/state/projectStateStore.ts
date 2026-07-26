import * as vscode from 'vscode';
import type { ProjectContext } from '../types';
import {
  cloneProjectContext,
  findProjectForResource as resolveProjectForResource
} from '../workspace/projectContext';

export interface ProjectStateSnapshot {
  activeResource: string | undefined;
  activeProject: ProjectContext | undefined;
  projects: ProjectContext[];
  hasProject: boolean;
  hasVariants: boolean;
  workspaceTrusted: boolean;
}

interface ProjectState extends Omit<ProjectStateSnapshot, 'activeResource'> {
  activeResource: vscode.Uri | undefined;
  activeProject: ProjectContext | undefined;
  projects: ProjectContext[];
}

export class ProjectStateStore implements vscode.Disposable {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<ProjectStateSnapshot>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private state: ProjectState = {
    activeResource: undefined,
    activeProject: undefined,
    projects: [],
    hasProject: false,
    hasVariants: false,
    workspaceTrusted: false
  };

  update(update: Partial<ProjectState>): ProjectStateSnapshot {
    const next = { ...this.state, ...update };
    this.state = {
      ...next,
      activeProject: next.activeProject
        ? cloneProjectContext(next.activeProject)
        : undefined,
      projects: next.projects.map(cloneProjectContext)
    };
    const snapshot = this.getSnapshot();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }

  getSnapshot(): ProjectStateSnapshot {
    return {
      activeResource: this.state.activeResource?.toString(),
      activeProject: this.state.activeProject
        ? cloneProjectContext(this.state.activeProject)
        : undefined,
      projects: this.state.projects.map(cloneProjectContext),
      hasProject: this.state.hasProject,
      hasVariants: this.state.hasVariants,
      workspaceTrusted: this.state.workspaceTrusted
    };
  }

  getProjects(): ProjectContext[] {
    return this.state.projects.map(cloneProjectContext);
  }

  getActiveProject(): ProjectContext | undefined {
    return this.state.activeProject
      ? cloneProjectContext(this.state.activeProject)
      : undefined;
  }

  findProjectById(id: string | undefined): ProjectContext | undefined {
    const project = id
      ? this.state.projects.find((entry) => entry.id === id)
      : undefined;
    return project ? cloneProjectContext(project) : undefined;
  }

  findProjectForResource(
    resource: vscode.Uri | string | undefined
  ): ProjectContext | undefined {
    return resolveProjectForResource(this.state.projects, resource);
  }

  getDiagnosticBundleSnapshot(): ProjectStateSnapshot {
    return this.getSnapshot();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
