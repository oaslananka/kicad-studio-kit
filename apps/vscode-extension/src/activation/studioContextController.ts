import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { KiCadCliDetector } from '../cli/kicadCliDetector';
import type { ContextBridge } from '../mcp/contextBridge';
import type { McpClient } from '../mcp/mcpClient';
import type { PcbEditorProvider } from '../providers/pcbEditorProvider';
import type { SchematicEditorProvider } from '../providers/schematicEditorProvider';
import type {
  DiagnosticStateStore,
  ProjectStateStore
} from '../state/stateStores';
import type { VariantProvider } from '../variants/variantProvider';
import { getActiveResourceUri } from '../utils/workspaceUtils';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';
import type { StudioContext } from '../types';
import type { ActivationState } from './activationState';

export interface StudioContextControllerDeps {
  projectState: ProjectStateStore;
  diagnosticState: DiagnosticStateStore;
  pcbEditorProvider: PcbEditorProvider;
  schematicEditorProvider: SchematicEditorProvider;
  variantProvider: VariantProvider;
  cliDetector: KiCadCliDetector;
  mcpClient: McpClient;
  contextBridge: ContextBridge;
  activationState: ActivationState;
}

export type PushStudioContextReason =
  | 'save'
  | 'focus'
  | 'cursor'
  | 'drc'
  | 'default';

/**
 * Builds and pushes the live "studio context" snapshot consumed by MCP, the
 * language-model tools, and the chat provider. Extracted from `activate()`
 * unchanged as part of the #397 composition-root split.
 */
export class StudioContextController {
  constructor(private readonly deps: StudioContextControllerDeps) {}

  async buildStudioContext(): Promise<StudioContext> {
    const {
      projectState,
      diagnosticState,
      pcbEditorProvider,
      schematicEditorProvider,
      variantProvider,
      cliDetector,
      mcpClient,
      activationState
    } = this.deps;
    const activeUri = getActiveResourceUri();
    const activeEditor = vscode.window.activeTextEditor;
    const selectedProject = projectState.getActiveProject();
    const resourceProject = activeUri
      ? projectState.findProjectForResource(activeUri)
      : undefined;
    const activeProject = selectedProject ?? resourceProject;
    const fileType = activeUri?.fsPath.endsWith('.kicad_sch')
      ? 'schematic'
      : activeUri?.fsPath.endsWith('.kicad_pcb')
        ? 'pcb'
        : 'other';
    const viewerState =
      fileType === 'pcb' && activeUri
        ? pcbEditorProvider.getViewerState(activeUri)
        : fileType === 'schematic' && activeUri
          ? schematicEditorProvider.getViewerState(activeUri)
          : undefined;
    const mcpState = isWorkspaceTrusted() ? mcpClient.getState() : undefined;
    const cli = isWorkspaceTrusted() ? await cliDetector.detect() : undefined;
    const latestProjectDrcRun =
      diagnosticState.getLatestDrcRun(activeProject?.id) ??
      activationState.latestDrcRun;
    return {
      activeFile: activeUri?.fsPath,
      fileType,
      project: activeProject,
      projectId: activeProject?.id,
      projectName: activeProject?.name,
      projectRoot: activeProject?.rootPath,
      projectFile: activeProject?.projectFile,
      drcErrors:
        latestProjectDrcRun?.diagnostics
          .map((diagnostic) => diagnostic.message)
          .slice(0, 20) ?? [],
      selectedReference: viewerState?.selectedReference,
      selectedArea: viewerState?.selectedArea,
      cursorPosition: activeEditor
        ? {
            line: activeEditor.selection.active.line,
            character: activeEditor.selection.active.character
          }
        : undefined,
      activeSheetPath:
        fileType === 'schematic' && activeUri
          ? path.relative(
              activeProject?.rootPath ??
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
                '',
              activeUri.fsPath
            )
          : undefined,
      visibleLayers: viewerState?.activeLayers,
      viewerEngine: viewerState?.engine,
      activeVariant: await variantProvider.getActiveVariantName(),
      mcpConnected: mcpState?.connected ?? false,
      kicadVersion: cli?.version,
      designBlocks: activeUri ? readDesignBlockNames(activeUri.fsPath) : []
    };
  }

  async pushStudioContext(
    reason: PushStudioContextReason = 'default'
  ): Promise<void> {
    if (!isWorkspaceTrusted()) {
      return;
    }
    await this.deps.contextBridge.pushContext(
      await this.buildStudioContext(),
      reason
    );
  }
}

export function readDesignBlockNames(file: string): string[] {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return [
      ...new Set(
        Array.from(
          text.matchAll(/\(\s*design_block\b[\s\S]*?\(\s*name\s+"([^"]+)"/g),
          (match) => match[1]
        ).filter((entry): entry is string => Boolean(entry))
      )
    ];
  } catch {
    return [];
  }
}
