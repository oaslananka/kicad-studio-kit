import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { DiagnosticSummary } from '../types';
import { Logger } from '../utils/logger';
import { readTextFileSync } from '../utils/fileUtils';
import { SExpressionParser, type SNode } from '../language/sExpressionParser';
import { KiCadCliRunner } from './kicadCliRunner';
import { ErcSourceLocations } from './ercSourceLocations';

interface ReportIssue {
  row: Record<string, unknown>;
  sheet?: { path: string; uuidPath: string } | undefined;
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
    const tmpJsonFile = path.join(
      os.tmpdir(),
      `kicadstudio-${kind}-${Date.now()}.json`
    );
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
      const detected = await this.runner.detectCli(false);
      await this.runner.runWithProgress<string>({
        command,
        cwd: path.dirname(file),
        progressTitle: kind === 'drc' ? 'Running DRC' : 'Running ERC'
      });
      const raw = fs.readFileSync(tmpJsonFile, 'utf8');
      const diagnostics = this.parseDiagnostics(raw, file, kind);
      return {
        diagnostics,
        summary: this.summarize(file, kind, diagnostics, {
          commandArgs: command,
          reportPath: tmpJsonFile,
          kicadVersion: detected?.version
        })
      };
    } catch (error) {
      this.logger.error(`Failed to run ${kind.toUpperCase()}`, error);
      throw error;
    } finally {
      fs.rmSync(tmpJsonFile, { force: true });
    }
  }

  private summarize(
    file: string,
    source: 'drc' | 'erc',
    diagnostics: vscode.Diagnostic[],
    metadata: {
      commandArgs: string[];
      reportPath: string;
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
      commandArgs: metadata.commandArgs,
      reportPath: metadata.reportPath,
      kicadVersion: metadata.kicadVersion
    };
  }

  private parseDiagnostics(
    rawJson: string,
    file: string,
    kind: 'drc' | 'erc'
  ): vscode.Diagnostic[] {
    const data: unknown = JSON.parse(rawJson);
    const ast = this.parser.parse(readTextFileSync(file));
    const rows = this.collectIssueRows(data);
    const sourceLocations =
      kind === 'erc' ? new ErcSourceLocations(file, this.parser) : undefined;
    const rootUri = vscode.Uri.file(file);
    // Build the coordinate candidates once per report, not once for every
    // diagnostic. Large KiCad projects may report hundreds of violations.
    const candidates = this.parser
      .findAllNodes(ast, 'at')
      .map((node) => ({ node, coords: this.extractCoordinates(node) }))
      .filter(
        (
          entry
        ): entry is {
          node: SNode;
          coords: { x: number; y: number };
        } => Boolean(entry.coords)
      );

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
            : this.findClosestRange(candidates, this.issuePosition(row));
      const severity = this.toSeverity(String(row['severity'] ?? 'warning'));
      const diagnostic = new vscode.Diagnostic(
        range,
        String(row['description'] ?? row['message'] ?? 'KiCad issue'),
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
