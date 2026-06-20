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

// Cursor moves fire continuously while typing/navigating. Coalesce them so the
// (relatively expensive) studio-context build runs at most once per idle window
// instead of once per cursor event. The ContextBridge applies a further
// reason-based send delay on top of this.
const CURSOR_PUSH_DEBOUNCE_MS = 250;

/**
 * Builds and pushes the live "studio context" snapshot consumed by MCP, the
 * language-model tools, and the chat provider. Extracted from `activate()` as
 * part of the #397 composition-root split; #398 adds an mtime-keyed design-block
 * cache and cursor-push debouncing so the build avoids redundant synchronous
 * file reads on hot paths.
 */
export class StudioContextController implements vscode.Disposable {
  private readonly designBlockCache = new DesignBlockCache();
  private cursorPushTimer: NodeJS.Timeout | undefined;

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
      designBlocks: activeUri
        ? this.designBlockCache.read(activeUri.fsPath)
        : []
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

  /**
   * Debounce high-frequency cursor pushes; route all other reasons straight
   * through so saves/focus/DRC stay responsive.
   */
  schedulePushStudioContext(reason: PushStudioContextReason = 'default'): void {
    if (reason !== 'cursor') {
      void this.pushStudioContext(reason);
      return;
    }
    if (this.cursorPushTimer) {
      clearTimeout(this.cursorPushTimer);
    }
    this.cursorPushTimer = setTimeout(() => {
      this.cursorPushTimer = undefined;
      void this.pushStudioContext('cursor');
    }, CURSOR_PUSH_DEBOUNCE_MS);
  }

  dispose(): void {
    if (this.cursorPushTimer) {
      clearTimeout(this.cursorPushTimer);
      this.cursorPushTimer = undefined;
    }
  }
}

/**
 * Caches design-block name parsing keyed by file path and modification time, so
 * a large board file is only re-read and re-parsed when it actually changes
 * rather than on every cursor move.
 */
export class DesignBlockCache {
  private readonly entries = new Map<
    string,
    { mtimeMs: number; names: string[] }
  >();

  constructor(
    private readonly reader: (file: string) => string[] = readDesignBlockNames
  ) {}

  read(file: string): string[] {
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
      this.entries.delete(file);
      return [];
    }
    const cached = this.entries.get(file);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.names;
    }
    const names = this.reader(file);
    this.entries.set(file, { mtimeMs, names });
    return names;
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
