import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KiCadCheckService } from '../../src/cli/checkCommands';
import { SExpressionParser } from '../../src/language/sExpressionParser';

const installed = path.join(
  process.env['ProgramFiles'] ?? 'C:/Program Files',
  'KiCad',
  '10.0'
);
const sample = path.join(installed, 'share', 'kicad', 'demos', 'vme-wren');
const binary = path.join(installed, 'bin', 'kicad-cli.exe');
const enabled =
  process.platform === 'win32' &&
  process.env['KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE'] === '1' &&
  fs.existsSync(binary) &&
  fs.existsSync(path.join(sample, 'vme-wren.kicad_pcb'));

(enabled ? test : test.skip)(
  'genuine 71.6 MB VME Wren DRC maps all 610 findings without AST OOM or sidecars',
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-vme-drc-'));
    const sha = (file: string): string =>
      createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    try {
      const name = 'vme-wren';
      for (const file of [
        name + '.kicad_pcb',
        name + '.kicad_pro',
        name + '.kicad_dru',
        'fp-lib-table'
      ]) {
        fs.copyFileSync(path.join(sample, file), path.join(dir, file));
      }
      const original = path.join(sample, name + '.kicad_pcb');
      const pcb = path.join(dir, name + '.kicad_pcb');
      const project = path.join(dir, name + '.kicad_pro');
      const originalHash = sha(original);
      const projectHash = sha(project);
      let temporaryDir = '';
      let report: any;
      const runner = {
        detectCli: jest.fn().mockResolvedValue({ version: '10.0.8' }),
        runWithProgress: jest.fn(
          async ({ command, cwd }: { command: string[]; cwd: string }) => {
            temporaryDir = cwd;
            expect(command.at(-1)).toBe(path.join(cwd, name + '.kicad_pcb'));
            expect(command).not.toContain('--save-board');
            const start = Date.now();
            const execution = spawnSync(binary, command, {
              cwd,
              encoding: 'utf8',
              timeout: 175_000
            });
            console.log('REAL_VME_DRC_KICAD_CLI_MS=' + (Date.now() - start));
            if (execution.error || execution.status !== 0) {
              throw new Error(
                'KiCad native DRC failed: ' +
                  String(execution.error ?? execution.stderr)
              );
            }
            report = JSON.parse(
              fs.readFileSync(command[command.indexOf('--output') + 1]!, 'utf8')
            );
            expect(fs.existsSync(path.join(cwd, name + '.kicad_prl'))).toBe(
              true
            );
          }
        )
      };
      const service = new KiCadCheckService(
        runner as never,
        new SExpressionParser(),
        { error: jest.fn() } as never
      );
      const start = Date.now();
      const result = await service.runDRC(pcb);
      const issues = [
        ...(report.violations ?? []),
        ...(report.unconnected_items ?? []),
        ...(report.schematic_parity ?? [])
      ];
      expect(issues).toHaveLength(610);
      expect(result.diagnostics).toHaveLength(610);
      // Verify the primary Problems row points to an actual KiCad UUID line,
      // independently of the source-locator implementation.
      const pcbSource = fs.readFileSync(pcb, 'utf8');
      const lineStarts = [0];
      let lineOffset = 0;
      while (true) {
        const nextBreak = pcbSource.indexOf('\n', lineOffset);
        if (nextBreak < 0) break;
        lineOffset = nextBreak + 1;
        lineStarts.push(lineOffset);
      }
      const exactUuidRows = issues.reduce((count, issue, index) => {
        const line = result.diagnostics[index]?.range.start.line ?? -1;
        const start = lineStarts[line];
        if (start === undefined || !Array.isArray(issue.items)) return count;
        const ending = pcbSource.indexOf('\n', start);
        const sourceLine = pcbSource
          .slice(start, ending < 0 ? undefined : ending)
          .toLowerCase();
        const exact = issue.items.some(
          (item: { uuid?: unknown }) =>
            typeof item.uuid === 'string' &&
            sourceLine.includes(item.uuid.toLowerCase())
        );
        return count + Number(exact);
      }, 0);
      console.log(
        'REAL_VME_DRC_UUID_SOURCE_COVERAGE=' +
          JSON.stringify({ exactUuidRows, findings: issues.length })
      );
      expect(exactUuidRows).toBeGreaterThan(100);
      const uniqueFullMarkers = new Set(
        result.diagnostics.map((diagnostic) =>
          JSON.stringify({
            range: diagnostic.range,
            message: diagnostic.message,
            severity: diagnostic.severity,
            code: diagnostic.code,
            source: diagnostic.source
          })
        )
      ).size;
      const uniqueMessagePositions = new Set(
        result.diagnostics.map(
          (diagnostic) =>
            `${diagnostic.range.start.line}:${diagnostic.range.start.character}|${diagnostic.severity}|${diagnostic.message}`
        )
      ).size;
      console.log(
        'REAL_VME_DRC_MARKER_UNIQUENESS=' +
          JSON.stringify({
            diagnostics: result.diagnostics.length,
            distinctFullMarkers: uniqueFullMarkers,
            distinctMessagePositions: uniqueMessagePositions
          })
      );
      expect(result.summary.errors).toBe(41);
      expect(result.summary.warnings).toBe(569);
      expect(result.diagnostics.map((d) => d.code)).toEqual(
        issues.map((row) => row.type)
      );
      const located = result.diagnostics.filter(
        (d) => d.range.start.line > 0
      ).length;
      expect(located).toBeGreaterThan(550);
      expect(sha(pcb)).toBe(originalHash);
      expect(sha(original)).toBe(originalHash);
      expect(sha(project)).toBe(projectHash);
      expect(fs.existsSync(path.join(dir, name + '.kicad_prl'))).toBe(false);
      expect(fs.existsSync(temporaryDir)).toBe(false);
      console.log(
        'REAL_VME_DRC_EXTENSION_PARITY=' +
          JSON.stringify({
            findings: issues.length,
            errors: result.summary.errors,
            warnings: result.summary.warnings,
            located,
            elapsedMs: Date.now() - start,
            heapMiB: Math.round(process.memoryUsage().heapUsed / 1048576),
            sidecarsInWorkspace: 0
          })
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
  220_000
);
