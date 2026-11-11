import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { LARGE_FILE_BYTES } from '../constants';
import type { DiagnosticSummary } from '../types';
import { Logger } from '../utils/logger';
import { readTextFileSync } from '../utils/fileUtils';
import { SExpressionParser, type SNode } from '../language/sExpressionParser';
import { KiCadCliRunner } from './kicadCliRunner';
import { ErcSourceLocations } from './ercSourceLocations';
import { DrcSourceCoordinates } from './drcSourceCoordinates';

interface ReportIssue {
  row: Record<string, unknown>;
  sheet?: { path: string; uuidPath: string } | undefined;
}

function containedPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return Boolean(
    relative &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

function projectLibraryRelativePath(
  uri: string | undefined
): string | undefined {
  const prefix = '${KIPRJMOD}/';
  if (!uri?.startsWith(prefix)) return undefined;
  const relative = uri.slice(prefix.length).replace(/\\/g, '/');
  if (
    !relative ||
    relative.split('/').some((part) => part === '.' || part === '..')
  ) {
    return undefined;
  }
  return relative;
}

/**
 * Keep the disposable DRC snapshot truthful for project-local KiCad libraries.
 * A KiCad library table copied without its KIPRJMOD paths reports fake
 * missing-footprint findings even when the original board is valid.
 */
function stageLocalProjectLibraries(
  sourceDir: string,
  temporaryDir: string,
  parser: SExpressionParser,
  captureSource: (file: string) => void
): void {
  const sourceRoot = fs.realpathSync(sourceDir);
  for (const tableName of ['fp-lib-table', 'sym-lib-table']) {
    const table = path.join(sourceDir, tableName);
    if (!fs.existsSync(table)) continue;
    const root = parser.parse(fs.readFileSync(table, 'utf8'));
    for (const entry of parser.findAllNodes(root, 'lib')) {
      const relative = projectLibraryRelativePath(
        parser.getAtomValue(entry, 'uri')
      );
      if (!relative) continue;
      const candidate = path.resolve(sourceDir, relative);
      if (!fs.existsSync(candidate)) continue;
      const resolved = fs.realpathSync(candidate);
      if (!containedPath(sourceRoot, resolved)) {
        throw new Error(
          'A project library symlink resolves outside the KiCad project.'
        );
      }
      const destination = path.resolve(temporaryDir, relative);
      if (
        !containedPath(temporaryDir, destination) ||
        fs.existsSync(destination)
      ) {
        continue;
      }
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory() && !stat.isFile()) continue;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(resolved, destination, {
        recursive: true,
        errorOnExist: true,
        force: false,
        filter: (source) => {
          if (fs.lstatSync(source).isSymbolicLink()) {
            throw new Error(
              'A project library contains a symlink. Resolve it inside the project before running DRC.'
            );
          }
          if (!containedPath(sourceRoot, fs.realpathSync(source))) {
            throw new Error(
              'A KiCad project library escapes the project directory.'
            );
          }
          if (fs.statSync(source).isFile()) captureSource(source);
          return true;
        }
      });
    }
  }
}

/**
 * Include genuine KiCad object labels when a rule concerns multiple parts.
 * VS Code coalesces identical message/range/code diagnostics, which hides
 * distinct courtyard-overlap pairs sharing the same first footprint.
 */
function describeIssue(
  row: Record<string, unknown>,
  kind: 'drc' | 'erc'
): string {
  const summary = String(row['description'] ?? row['message'] ?? 'KiCad issue');
  if (kind !== 'drc' || !Array.isArray(row['items'])) return summary;
  const labels = row['items']
    .filter(
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    )
    .map((value) =>
      typeof value['description'] === 'string'
        ? value['description'].trim()
        : ''
    )
    .filter((value) => value.length > 0)
    .slice(0, 3);
  return labels.length > 1 ? `${summary} — ${labels.join(' / ')}` : summary;
}

export class KiCadCheckService {
  constructor(
    private readonly runner: KiCadCliRunner,
    private readonly parser: SExpressionParser,
    private readonly logger: Logger
  ) {}

  async runDRC(
    pcbFile: string
  ): Promise<{ diagnostics: vscode.Diagnostic[]; summary: DiagnosticSummary }> {
    return this.runCheck('drc', pcbFile);
  }

  async runERC(
    schFile: string
  ): Promise<{ diagnostics: vscode.Diagnostic[]; summary: DiagnosticSummary }> {
    return this.runCheck('erc', schFile);
  }

  private async runCheck(
    kind: 'drc' | 'erc',
    file: string
  ): Promise<{ diagnostics: vscode.Diagnostic[]; summary: DiagnosticSummary }> {
    // Each check gets its own disposable workspace. KiCad's PCB DRC may
    // create a .kicad_prl beside its input even without --save-board.
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), `kicadstudio-${kind}-`)
    );
    const tmpJsonFile = path.join(tempRoot, 'report.json');
    const sourceStats: Array<{
      file: string;
      size: number;
      mtimeMs: number;
    }> = [];
    const validateSource = (): void => {
      for (const source of sourceStats) {
        const current = fs.statSync(source.file);
        if (
          current.size !== source.size ||
          current.mtimeMs !== source.mtimeMs
        ) {
          throw new Error(
            'The KiCad project changed during DRC. Save and rerun the check.'
          );
        }
      }
    };
    const command =
      kind === 'drc'
        ? [
            'pcb',
            'drc',
            '--output',
            tmpJsonFile,
            '--format',
            'json',
            '--units',
            'mm',
            '--severity-all',
            file
          ]
        : [
            'sch',
            'erc',
            '--output',
            tmpJsonFile,
            '--format',
            'json',
            '--units',
            'mm',
            '--severity-all',
            file
          ];

    try {
      let checkedCwd = path.dirname(file);
      if (kind === 'drc') {
        if (path.extname(file).toLowerCase() !== '.kicad_pcb') {
          throw new Error('Choose a .kicad_pcb board for DRC.');
        }
        const sourceDir = path.dirname(file);
        const boardName = path.basename(file);
        const projectName = path.basename(file, path.extname(file));
        for (const name of [
          boardName,
          `${projectName}.kicad_pro`,
          `${projectName}.kicad_dru`,
          'fp-lib-table',
          'sym-lib-table'
        ]) {
          const original = path.join(sourceDir, name);
          if (!fs.existsSync(original)) {
            if (name === boardName) {
              throw new Error('The KiCad PCB no longer exists.');
            }
            continue;
          }
          const before = fs.statSync(original);
          if (!before.isFile()) {
            throw new Error('A KiCad project input is not a regular file.');
          }
          fs.copyFileSync(original, path.join(tempRoot, name));
          const after = fs.statSync(original);
          if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
            throw new Error(
              'The KiCad project changed while preparing DRC. Try again.'
            );
          }
          sourceStats.push({
            file: original,
            size: after.size,
            mtimeMs: after.mtimeMs
          });
        }
        stageLocalProjectLibraries(
          sourceDir,
          tempRoot,
          this.parser,
          (source) => {
            const stat = fs.statSync(source);
            sourceStats.push({
              file: source,
              size: stat.size,
              mtimeMs: stat.mtimeMs
            });
          }
        );
        validateSource();
        checkedCwd = tempRoot;
        command[command.length - 1] = path.join(tempRoot, boardName);
      }
      const detected = await this.runner.detectCli(false);
      await this.runner.runWithProgress<string>({
        command,
        cwd: checkedCwd,
        progressTitle: kind === 'drc' ? 'Running DRC' : 'Running ERC'
      });
      const raw = fs.readFileSync(tmpJsonFile, 'utf8');
      validateSource();
      const diagnostics = this.parseDiagnostics(raw, file, kind);
      validateSource();
      return {
        diagnostics,
        // The temporary report and input copy are deleted on completion.
        // Do not advertise their dead paths as a usable report/CLI command.
        summary: this.summarize(file, kind, diagnostics, {
          kicadVersion: detected?.version
        })
      };
    } catch (error) {
      this.logger.error(`Failed to run ${kind.toUpperCase()}`, error);
      throw error;
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  private summarize(
    file: string,
    source: 'drc' | 'erc',
    diagnostics: vscode.Diagnostic[],
    metadata: {
      kicadVersion: string | undefined;
    }
  ): DiagnosticSummary {
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    for (const diagnostic of diagnostics) {
      if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
        errors += 1;
      } else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
        warnings += 1;
      } else {
        infos += 1;
      }
    }
    return {
      file,
      source,
      errors,
      warnings,
      infos,
      capturedAt: new Date().toISOString(),
      freshness: diagnostics.length > 0 ? 'fresh-dirty' : 'fresh-clean',
      origin: 'kicad-cli',
      kicadVersion: metadata.kicadVersion
    };
  }

  private parseDiagnostics(
    rawJson: string,
    file: string,
    kind: 'drc' | 'erc'
  ): vscode.Diagnostic[] {
    const data: unknown = JSON.parse(rawJson);
    const sourceText = readTextFileSync(file);
    const rows = this.collectIssueRows(data);
    const sourceLocations =
      kind === 'erc' ? new ErcSourceLocations(file, this.parser) : undefined;
    const rootUri = vscode.Uri.file(file);
    // Expanding a 71 MB PCB into an AST can exceed a 2 GB V8 heap.
    // Every PCB uses genuine UUID source anchors; only large boards skip the
    // AST entirely. Small-board unmatched findings keep their AST fallback.
    const largeBoard =
      kind === 'drc' &&
      Buffer.byteLength(sourceText, 'utf8') > LARGE_FILE_BYTES;
    // Index real object identities for every PCB size. Keep the existing
    // small-board AST fallback for findings without a verified UUID.
    const drcLocations =
      kind === 'drc' ? new DrcSourceCoordinates(sourceText) : undefined;
    const largeLocations = largeBoard ? drcLocations : undefined;
    const ast = largeLocations ? undefined : this.parser.parse(sourceText);
    const candidates = ast
      ? this.parser
          .findAllNodes(ast, 'at')
          .map((node) => ({ node, coords: this.extractCoordinates(node) }))
          .filter(
            (
              entry
            ): entry is {
              node: SNode;
              coords: { x: number; y: number };
            } => Boolean(entry.coords)
          )
      : [];

    return rows.map(({ row, sheet }) => {
      // KiCad 10 reports issue coordinates in items[].pos. A violation is
      // one diagnostic; its constituent item descriptions are not issues.
      const verified = sourceLocations?.resolve(sheet, row['items']);
      const isOtherSheet =
        verified &&
        verified.uri.fsPath.toLowerCase() !== rootUri.fsPath.toLowerCase();
      // An item with an explicit sheet UUID path must NEVER be projected
      // onto unrelated root-sheet coordinates when source lookup fails.
      const range =
        verified && !isOtherSheet
          ? verified.range
          : isOtherSheet || (kind === 'erc' && sheet !== undefined)
            ? new vscode.Range(0, 0, 0, 1)
            : (drcLocations?.exactUuid(row['items']) ??
              (largeLocations
                ? largeLocations.closest(this.issuePosition(row))
                : this.findClosestRange(candidates, this.issuePosition(row))));
      const severity = this.toSeverity(String(row['severity'] ?? 'warning'));
      const diagnostic = new vscode.Diagnostic(
        range,
        describeIssue(row, kind),
        severity
      );
      diagnostic.source = `kicad-cli:${kind}`;
      if (verified) {
        diagnostic.relatedInformation = [
          {
            location: verified,
            message:
              'Exact KiCad source UUID location (open related information)'
          }
        ];
      }
      diagnostic.code = String(
        row['rule_name'] ?? row['rule'] ?? row['type'] ?? 'rule'
      );
      return diagnostic;
    });
  }

  private collectIssueRows(
    data: unknown,
    sheet?: ReportIssue['sheet']
  ): ReportIssue[] {
    if (!data || typeof data !== 'object') {
      return [];
    }

    if (Array.isArray(data)) {
      return data.flatMap((item) => this.collectIssueRows(item, sheet));
    }

    const record = data as Record<string, unknown>;
    // A standalone violation remains supported, but a descriptive metadata
    // row (such as KiCad's ERC rule catalog) is never a diagnostic.
    if (
      ('description' in record || 'message' in record) &&
      ('severity' in record || 'items' in record)
    ) {
      return [{ row: record, sheet }];
    }

    // KiCad 10 reports carry a rule-description catalog alongside findings.
    // Recursively visiting every array misidentifies those documentation
    // descriptions as violations. Only the named finding collections count.
    const issueGroups = [
      record['violations'],
      record['unconnected_items'],
      record['schematic_parity']
    ];
    const rows = issueGroups
      .filter(Array.isArray)
      .flatMap((items) => this.collectIssueRows(items, sheet));
    if (Array.isArray(record['sheets'])) {
      for (const child of record['sheets']) {
        if (!child || typeof child !== 'object') continue;
        const entry = child as Record<string, unknown>;
        const nextSheet =
          typeof entry['path'] === 'string' &&
          typeof entry['uuid_path'] === 'string'
            ? { path: entry['path'], uuidPath: entry['uuid_path'] }
            : undefined;
        rows.push(...this.collectIssueRows(child, nextSheet));
      }
    }
    return rows;
  }

  private issuePosition(
    row: Record<string, unknown>
  ): { x: number; y: number } | undefined {
    const items = row['items'];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const pos = (item as Record<string, unknown>)['pos'];
        if (!pos || typeof pos !== 'object') {
          continue;
        }
        const coordinate = pos as Record<string, unknown>;
        const x = Number(coordinate['x']);
        const y = Number(coordinate['y']);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          return { x, y };
        }
      }
    }

    // Compatibility with older, flat diagnostic payloads.
    if (row['x'] !== undefined && row['y'] !== undefined) {
      const x = Number(row['x']);
      const y = Number(row['y']);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return { x, y };
      }
    }
    return undefined;
  }

  private findClosestRange(
    candidates: readonly {
      node: SNode;
      coords: { x: number; y: number };
    }[],
    position: { x: number; y: number } | undefined
  ): vscode.Range {
    if (!position || candidates.length === 0) {
      return new vscode.Range(0, 0, 0, 1);
    }

    const closest = candidates.reduce((best, current) => {
      const bestScore =
        Math.abs(best.coords.x - position.x) +
        Math.abs(best.coords.y - position.y);
      const currentScore =
        Math.abs(current.coords.x - position.x) +
        Math.abs(current.coords.y - position.y);
      return currentScore < bestScore ? current : best;
    });

    return this.parser.getPosition(closest.node);
  }

  private extractCoordinates(
    node: SNode
  ): { x: number; y: number } | undefined {
    const xNode = node.children?.[1];
    const yNode = node.children?.[2];
    if (!xNode || !yNode) {
      return undefined;
    }
    return {
      x: Number(xNode.value ?? 0),
      y: Number(yNode.value ?? 0)
    };
  }

  private toSeverity(value: string): vscode.DiagnosticSeverity {
    const normalized = value.toLowerCase();
    if (normalized.includes('error')) {
      return vscode.DiagnosticSeverity.Error;
    }
    if (normalized.includes('warn')) {
      return vscode.DiagnosticSeverity.Warning;
    }
    return vscode.DiagnosticSeverity.Information;
  }
}
