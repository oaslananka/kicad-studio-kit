import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  buildCliExportCommands,
  discoverGerberLayers
} from '../cli/exportCommands';
import { ComponentSearchService } from '../components/componentSearch';
import { SETTINGS } from '../constants';
import { KiCadLibraryIndexer } from '../library/libraryIndexer';
import { VariantProvider } from '../variants/variantProvider';
import type { DiagnosticSummary, StudioContext } from '../types';
import { ensureDirectory } from '../utils/fileUtils';
import { resolveWorkspaceOutputDir } from '../utils/pathUtils';
import { Logger } from '../utils/logger';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';
import { KiCadCheckService } from '../cli/checkCommands';
import { KiCadCliDetector } from '../cli/kicadCliDetector';
import { KiCadCliRunner } from '../cli/kicadCliRunner';
import {
  createLanguageModelTextPart,
  createLanguageModelToolResult,
  createMarkdownString,
  getLanguageModelApi,
  type LanguageModelTool
} from './api';

const TOOL_NAMES = {
  runDrc: 'kicadstudio_runDrc',
  runErc: 'kicadstudio_runErc',
  exportGerbers: 'kicadstudio_exportGerbers',
  openFile: 'kicadstudio_openFile',
  searchComponent: 'kicadstudio_searchComponent',
  searchSymbol: 'kicadstudio_searchSymbol',
  searchFootprint: 'kicadstudio_searchFootprint',
  getActiveContext: 'kicadstudio_getActiveContext',
  listVariants: 'kicadstudio_listVariants',
  switchVariant: 'kicadstudio_switchVariant'
} as const;

interface DrcToolInput {
  pcbPath?: string | undefined;
}

interface ErcToolInput {
  schPath?: string | undefined;
}

interface ExportGerberToolInput {
  pcbPath?: string | undefined;
  variant?: string | undefined;
}

interface OpenFileToolInput {
  uri?: string | undefined;
}

interface SearchToolInput {
  query?: string | undefined;
}

interface SwitchVariantToolInput {
  variant?: string | undefined;
}

export interface LanguageModelToolServices {
  logger: Logger;
  checkService: KiCadCheckService;
  cliDetector: KiCadCliDetector;
  cliRunner: KiCadCliRunner;
  componentSearch: ComponentSearchService;
  libraryIndexer: KiCadLibraryIndexer;
  variantProvider: VariantProvider;
  diagnosticsCollection: vscode.DiagnosticCollection;
  getStudioContext(): Promise<StudioContext>;
  setLatestDrcRun(value: {
    file: string;
    diagnostics: vscode.Diagnostic[];
    summary: DiagnosticSummary;
  }): void;
}

export function registerLanguageModelTools(
  context: vscode.ExtensionContext,
  services: LanguageModelToolServices
): vscode.Disposable {
  const registered: vscode.Disposable[] = [];

  const disposeRegistered = (): void => {
    while (registered.length) {
      registered.pop()?.dispose();
    }
  };

  const refresh = (): void => {
    disposeRegistered();

    const lm = getLanguageModelApi();
    if (typeof lm?.registerTool !== 'function') {
      services.logger.debug(
        'VS Code language model tool API is unavailable on this host.'
      );
      return;
    }
    if (
      !vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.aiAllowTools, true)
    ) {
      services.logger.debug(
        'Language model tools are disabled by configuration.'
      );
      return;
    }
    if (!isWorkspaceTrusted()) {
      services.logger.debug(
        'Language model tools are disabled in restricted workspaces.'
      );
      return;
    }

    const toolMap: Array<[string, LanguageModelTool<unknown>]> = [
      [TOOL_NAMES.runDrc, createRunDrcTool(services)],
      [TOOL_NAMES.runErc, createRunErcTool(services)],
      [TOOL_NAMES.exportGerbers, createExportGerbersTool(services)],
      [TOOL_NAMES.openFile, createOpenFileTool()],
      [TOOL_NAMES.searchComponent, createSearchComponentTool(services)],
      [TOOL_NAMES.searchSymbol, createSearchSymbolTool(services)],
      [TOOL_NAMES.searchFootprint, createSearchFootprintTool(services)],
      [TOOL_NAMES.getActiveContext, createGetActiveContextTool(services)],
      [TOOL_NAMES.listVariants, createListVariantsTool(services)],
      [TOOL_NAMES.switchVariant, createSwitchVariantTool(services)]
    ];

    for (const [name, tool] of toolMap) {
      registered.push(lm.registerTool(name, tool));
    }
  };

  refresh();
  const configurationDisposable = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration(SETTINGS.aiAllowTools)) {
        refresh();
      }
    }
  );
  const trustDisposable =
    typeof vscode.workspace.onDidGrantWorkspaceTrust === 'function'
      ? vscode.workspace.onDidGrantWorkspaceTrust(refresh)
      : { dispose(): void {} };

  return {
    dispose(): void {
      configurationDisposable.dispose();
      trustDisposable.dispose();
      disposeRegistered();
    }
  };
}

function createRunDrcTool(
  services: LanguageModelToolServices
): LanguageModelTool<DrcToolInput> {
  return {
    async prepareInvocation() {
      return {
        invocationMessage: 'Running KiCad DRC'
      };
    },
    async invoke(options) {
      const file = await resolveTargetFile(options.input.pcbPath, '.kicad_pcb');
      if (!file) {
        throw new Error(
          'No KiCad PCB file is available. Provide an absolute pcbPath or open a .kicad_pcb file.'
        );
      }

      const result = await services.checkService.runDRC(file);
      services.diagnosticsCollection.set(
        vscode.Uri.file(file),
        result.diagnostics
      );
      services.setLatestDrcRun({
        file,
        diagnostics: result.diagnostics,
        summary: result.summary
      });

      return buildToolResult(
        `DRC completed for ${path.basename(file)}: ${formatSummary(result.summary)}.`,
        {
          file,
          summary: result.summary,
          diagnostics: result.diagnostics.map(serializeDiagnostic)
        }
      );
    }
  };
}

function createRunErcTool(
  services: LanguageModelToolServices
): LanguageModelTool<ErcToolInput> {
  return {
    async prepareInvocation() {
      return {
        invocationMessage: 'Running KiCad ERC'
      };
    },
    async invoke(options) {
      const file = await resolveTargetFile(options.input.schPath, '.kicad_sch');
      if (!file) {
        throw new Error(
          'No KiCad schematic file is available. Provide an absolute schPath or open a .kicad_sch file.'
        );
      }

      const result = await services.checkService.runERC(file);
      services.diagnosticsCollection.set(
        vscode.Uri.file(file),
        result.diagnostics
      );

      return buildToolResult(
        `ERC completed for ${path.basename(file)}: ${formatSummary(result.summary)}.`,
        {
          file,
          summary: result.summary,
          diagnostics: result.diagnostics.map(serializeDiagnostic)
        }
      );
    }
  };
}

function createExportGerbersTool(
  services: LanguageModelToolServices
): LanguageModelTool<ExportGerberToolInput> {
  return {
    async prepareInvocation(options) {
      const variant = options.input.variant?.trim();
      return {
        invocationMessage: 'Exporting KiCad Gerbers',
        confirmationMessages: {
          title: 'Export KiCad Gerbers',
          message: createMarkdownString(
            [
              'Create Gerber output files in the configured KiCad Studio output directory?',
              variant ? `Variant override: \`${variant}\`` : undefined
            ]
              .filter(Boolean)
              .join('\n\n')
          )
        }
      };
    },
    async invoke(options, token) {
      const file = await resolveTargetFile(options.input.pcbPath, '.kicad_pcb');
      if (!file) {
        throw new Error(
          'No KiCad PCB file is available. Provide an absolute pcbPath or open a .kicad_pcb file.'
        );
      }

      const outputDir = resolveOutputDir(file);
      const detected = await services.cliDetector.detect(true);
      const versionMajor = Number(detected?.version.split('.')[0] ?? '9');
      const activeVariant =
        options.input.variant?.trim() ||
        (await services.variantProvider.getActiveVariantName());
      const exportCommands = buildCliExportCommands(
        'export-gerbers',
        file,
        outputDir,
        { versionMajor, gerberLayers: await discoverGerberLayers(file) }
      );
      const commands = await Promise.all(
        exportCommands.map(async (command) =>
          withVariantFlag(
            command,
            activeVariant,
            await supportsVariantFlag(
              services.cliDetector,
              command,
              versionMajor
            )
          )
        )
      );

      for (const [index, command] of commands.entries()) {
        await services.cliRunner.run({
          command,
          cwd: path.dirname(file),
          progressTitle: `Exporting Gerbers (${index + 1}/${commands.length})`,
          signal: token.isCancellationRequested
            ? AbortSignal.abort()
            : undefined
        });
      }

      return buildToolResult(
        `Gerber export completed for ${path.basename(file)} into ${outputDir}.`,
        {
          file,
          outputDir,
          variant: activeVariant,
          commands
        }
      );
    }
  };
}

function createOpenFileTool(): LanguageModelTool<OpenFileToolInput> {
  return {
    async prepareInvocation(options) {
      const target = options.input.uri?.trim();
      return {
        invocationMessage: 'Opening KiCad file',
        ...(target
          ? {
              confirmationMessages: {
                title: 'Open file in VS Code',
                message: createMarkdownString(
                  `Open \`${target}\` in the editor?`
                )
              }
            }
          : {})
      };
    },
    async invoke(options) {
      const target = options.input.uri?.trim();
      if (!target) {
        throw new Error('The uri parameter is required.');
      }

      const uri = toFileOrParsedUri(target);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { preview: false });
      return buildToolResult(`Opened ${uri.fsPath}.`, { uri: uri.fsPath });
    }
  };
}

function createSearchComponentTool(
  services: LanguageModelToolServices
): LanguageModelTool<SearchToolInput> {
  return {
    async invoke(options) {
      const query = options.input.query?.trim();
      if (!query) {
        throw new Error('The query parameter is required.');
      }

      const results = await services.componentSearch.searchQuery(query);
      const topResults = results.slice(0, 10);
      return buildToolResult(
        topResults.length
          ? `Found ${topResults.length} component matches for "${query}".`
          : `No component matches were found for "${query}".`,
        {
          query,
          results: topResults
        }
      );
    }
  };
}

function createSearchSymbolTool(
  services: LanguageModelToolServices
): LanguageModelTool<SearchToolInput> {
  return {
    async invoke(options) {
      const query = options.input.query?.trim();
      if (!query) {
        throw new Error('The query parameter is required.');
      }

      await ensureLibraryIndex(services.libraryIndexer);
      const results = services.libraryIndexer.searchSymbols(query).slice(0, 10);
      return buildToolResult(
        results.length
          ? `Found ${results.length} symbol matches for "${query}".`
          : `No symbol matches were found for "${query}".`,
        {
          query,
          results
        }
      );
    }
  };
}

function createSearchFootprintTool(
  services: LanguageModelToolServices
): LanguageModelTool<SearchToolInput> {
  return {
    async invoke(options) {
      const query = options.input.query?.trim();
      if (!query) {
        throw new Error('The query parameter is required.');
      }

      await ensureLibraryIndex(services.libraryIndexer);
      const results = services.libraryIndexer
        .searchFootprints(query)
        .slice(0, 10);
      return buildToolResult(
        results.length
          ? `Found ${results.length} footprint matches for "${query}".`
          : `No footprint matches were found for "${query}".`,
        {
          query,
          results
        }
      );
    }
  };
}

function createGetActiveContextTool(
  services: LanguageModelToolServices
): LanguageModelTool<Record<string, never>> {
  return {
    async invoke() {
      const context = await services.getStudioContext();
      return buildToolResult(
        'Returned the active KiCad Studio context.',
        context
      );
    }
  };
}

function createListVariantsTool(
  services: LanguageModelToolServices
): LanguageModelTool<Record<string, never>> {
  return {
    async invoke() {
      const variants = await services.variantProvider.listVariants();
      return buildToolResult(
        variants.length
          ? `Found ${variants.length} design variants.`
          : 'No design variants are currently available.',
        {
          variants: variants.map((variant) => ({
            name: variant.name,
            isDefault: variant.isDefault,
            overrides: variant.componentOverrides.length
          }))
        }
      );
    }
  };
}

function createSwitchVariantTool(
  services: LanguageModelToolServices
): LanguageModelTool<SwitchVariantToolInput> {
  return {
    async prepareInvocation(options) {
      const target = options.input.variant?.trim();
      return {
        invocationMessage: 'Switching KiCad design variant',
        confirmationMessages: {
          title: 'Switch active KiCad variant',
          message: createMarkdownString(
            target
              ? `Switch the active variant to \`${target}\`?`
              : 'Select a KiCad variant to activate.'
          )
        }
      };
    },
    async invoke(options) {
      const target = options.input.variant?.trim();
      if (!target) {
        throw new Error('The variant parameter is required.');
      }

      const variant = await services.variantProvider.getVariantByName(target);
      if (!variant) {
        const available = await services.variantProvider.listVariants();
        throw new Error(
          `Variant "${target}" was not found. Available variants: ${available.map((item) => item.name).join(', ') || 'none'}.`
        );
      }

      await services.variantProvider.setActive(variant);
      return buildToolResult(`Active variant switched to ${variant.name}.`, {
        activeVariant: variant.name
      });
    }
  };
}

function buildToolResult(summary: string, payload: unknown): unknown {
  return createLanguageModelToolResult([
    createLanguageModelTextPart(summary),
    createLanguageModelTextPart(JSON.stringify(payload, null, 2))
  ]);
}

function formatSummary(summary: DiagnosticSummary): string {
  return `${summary.errors} errors, ${summary.warnings} warnings, ${summary.infos} infos`;
}

function serializeDiagnostic(
  diagnostic: vscode.Diagnostic
): Record<string, unknown> {
  return {
    message: diagnostic.message,
    severity: diagnostic.severity,
    source: diagnostic.source,
    code: diagnostic.code,
    range: {
      start: {
        line: diagnostic.range.start.line,
        character: diagnostic.range.start.character
      },
      end: {
        line: diagnostic.range.end.line,
        character: diagnostic.range.end.character
      }
    }
  };
}

async function resolveTargetFile(
  requestedPath: string | undefined,
  extension: '.kicad_pcb' | '.kicad_sch'
): Promise<string | undefined> {
  if (requestedPath?.trim()) {
    const candidate = requestedPath.trim();
    return path.isAbsolute(candidate)
      ? candidate
      : path.join(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
          candidate
        );
  }

  const active = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (active?.endsWith(extension)) {
    return active;
  }

  const files = await vscode.workspace.findFiles(
    `**/*${extension}`,
    '**/node_modules/**',
    1
  );
  return files[0]?.fsPath;
}

function resolveOutputDir(file: string): string {
  const configured = vscode.workspace
    .getConfiguration()
    .get<string>(SETTINGS.outputDir, 'fab');
  const outputDir = resolveWorkspaceOutputDir(file, configured);
  ensureDirectory(outputDir);
  return outputDir;
}

function withVariantFlag(
  command: string[],
  variant: string | undefined,
  supported: boolean
): string[] {
  if (!variant || !supported || command.includes('--variant')) {
    return command;
  }

  const [file] = command.slice(-1);
  if (!file) {
    return command;
  }
  return [...command.slice(0, -1), '--variant', variant, file];
}

async function supportsVariantFlag(
  detector: KiCadCliDetector,
  command: string[],
  versionMajor: number
): Promise<boolean> {
  if (versionMajor < 10) {
    return false;
  }
  if (typeof detector.commandHelpIncludes !== 'function') {
    return false;
  }
  const helpCommand = command.filter((arg) => arg !== '--output').slice(0, 3);
  return detector.commandHelpIncludes(helpCommand, /--variant\b/);
}

async function ensureLibraryIndex(indexer: KiCadLibraryIndexer): Promise<void> {
  if (indexer.isIndexed() && !indexer.isStale()) {
    return;
  }
  await indexer.indexAll();
}

function toFileOrParsedUri(target: string): vscode.Uri {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) {
    return vscode.Uri.parse(target);
  }
  return vscode.Uri.file(target);
}
