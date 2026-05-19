import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { DiagnosticSummary } from '../types';
import { Logger } from '../utils/logger';
import { readTextFileSync } from '../utils/fileUtils';
import { SExpressionParser, type SNode } from '../language/sExpressionParser';
import { KiCadCliRunner } from './kicadCliRunner';

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
      await this.runner.runWithProgress<string>({
        command,
        cwd: path.dirname(file),
        progressTitle: kind === 'drc' ? 'Running DRC' : 'Running ERC'
      });
      const raw = fs.readFileSync(tmpJsonFile, 'utf8');
      const diagnostics = this.parseDiagnostics(raw, file, kind);
      return {
        diagnostics,
        summary: this.summarize(file, kind, diagnostics)
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
    diagnostics: vscode.Diagnostic[]
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
    return { file, source, errors, warnings, infos };
  }

  private parseDiagnostics(
    rawJson: string,
    file: string,
    kind: 'drc' | 'erc'
  ): vscode.Diagnostic[] {
    const data = JSON.parse(rawJson);
    const ast = this.parser.parse(readTextFileSync(file));
    const rows = this.collectIssueRows(data);

    return rows.map((row) => {
      const range = this.findClosestRange(
        ast,
        Number(row['x'] ?? 0),
        Number(row['y'] ?? 0)
      );
      const severity = this.toSeverity(String(row['severity'] ?? 'warning'));
      const diagnostic = new vscode.Diagnostic(
        range,
        String(row['description'] ?? row['message'] ?? 'KiCad issue'),
        severity
      );
      diagnostic.source = `kicad-cli:${kind}`;
      diagnostic.code = String(row['rule_name'] ?? row['rule'] ?? 'rule');
      return diagnostic;
    });
  }

  private collectIssueRows(data: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(data)) {
      return data.flatMap((item) => this.collectIssueRows(item));
    }
    if (!data || typeof data !== 'object') {
      return [];
    }

    const record = data as Record<string, unknown>;
    const nestedArrays = Object.values(record)
      .filter(Array.isArray)
      .flatMap((value) => this.collectIssueRows(value));

    if ('description' in record || 'message' in record) {
      return [record, ...nestedArrays];
    }

    return nestedArrays;
  }

  private findClosestRange(root: SNode, x: number, y: number): vscode.Range {
    const candidates = this.parser
      .findAllNodes(root, 'at')
      .map((node) => ({
        node,
        coords: this.extractCoordinates(node)
      }))
      .filter(
        (entry): entry is { node: SNode; coords: { x: number; y: number } } =>
          Boolean(entry.coords)
      );

    if (!candidates.length) {
      return new vscode.Range(0, 0, 0, 1);
    }

    const closest = candidates.reduce((best, current) => {
      const bestScore =
        Math.abs(best.coords.x - x) + Math.abs(best.coords.y - y);
      const currentScore =
        Math.abs(current.coords.x - x) + Math.abs(current.coords.y - y);
      return currentScore < bestScore ? current : best;
    });

    const parentRange = this.parser.getPosition(closest.node);
    return parentRange;
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
