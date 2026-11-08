import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { KiCadCheckService } from '../../src/cli/checkCommands';
import { DiagnosticStateStore } from '../../src/state/diagnosticStateStore';
import { KiCadDiagnosticsAggregator } from '../../src/language/diagnosticsAggregator';
import { SExpressionParser } from '../../src/language/sExpressionParser';

const execFileAsync = promisify(execFile);
const kicadRoot = path.join(
  process.env['ProgramFiles'] ?? String.raw`C:\Program Files`,
  'KiCad',
  '10.0'
);
const cliPath = path.join(kicadRoot, 'bin', 'kicad-cli.exe');
const exampleDir = path.join(
  kicadRoot,
  'share',
  'kicad',
  'demos',
  'royalblue54L_feather'
);
const exampleSchematic = path.join(
  exampleDir,
  'RoyalBlue54L-Feather.kicad_sch'
);
const enabled =
  process.platform === 'win32' &&
  process.env['KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE'] === '1' &&
  fs.existsSync(cliPath) &&
  fs.existsSync(exampleSchematic);
const genuineTest = enabled ? it : it.skip;

type RealErcViolation = {
  description?: string;
  type?: string;
  severity?: string;
  items?: { pos?: { x: number; y: number } }[];
};

describe('native KiCad 10 ERC report parity — isolated, opt-in', () => {
  genuineTest(
    'matches every actual KiCad ERC violation by count, severity, rule code and message',
    async () => {
      const tmp = fs.mkdtempSync(
        path.join(os.tmpdir(), 'studio-real-erc-parity-')
      );
      const originalBytes = fs.readFileSync(exampleSchematic);
      const originalFingerprint = originalBytes
        .toString('base64')
        .slice(0, 120);
      const sourceHash = createHash('sha256')
        .update(originalBytes)
        .digest('hex');

      try {
        const isolatedDir = path.join(tmp, 'project');
        fs.cpSync(exampleDir, isolatedDir, { recursive: true });
        const schematic = path.join(
          isolatedDir,
          path.basename(exampleSchematic)
        );
        const isolatedHash = createHash('sha256')
          .update(fs.readFileSync(schematic))
          .digest('hex');
        expect(isolatedHash).toBe(sourceHash);
        let actualSheetPaths: string[] = [];
        const runner = {
          detectCli: jest.fn().mockResolvedValue({ version: '10.0.8' }),
          runWithProgress: jest
            .fn()
            .mockImplementation(
              async ({ command, cwd }: { command: string[]; cwd: string }) => {
                expect(command.slice(0, 2)).toEqual(['sch', 'erc']);
                expect(command).toContain('--severity-all');
                // Native KiCad 10 on Windows took 32.41s in an isolated
                // baseline; 35s left <3s for normal host variance.
                // Keep a finite process limit without changing KiCad parity.
                const startedAt = Date.now();
                await execFileAsync(cliPath, command, {
                  cwd,
                  timeout: 60_000,
                  maxBuffer: 5 * 1024 * 1024
                });
                console.log(
                  'REAL_KICAD_10_ERC_CLI_ELAPSED_MS=' + (Date.now() - startedAt)
                );
                const reportFile = command[command.indexOf('--output') + 1];
                const json = JSON.parse(
                  fs.readFileSync(reportFile!, 'utf8')
                ) as {
                  sheets: { path: string; violations: RealErcViolation[] }[];
                };
                const expected = json.sheets.flatMap(
                  (sheet) => sheet.violations ?? []
                );
                actualSheetPaths = json.sheets.flatMap((sheet) =>
                  (sheet.violations ?? []).map(() => sheet.path)
                );
                expect(expected.length).toBeGreaterThan(20);
                console.log(
                  'REAL_KICAD_10_ERC_REFERENCE_VIOLATIONS=' +
                    expected.length +
                    ' SHEETS=' +
                    json.sheets.length
                );
                return expected;
              }
            )
        };
        const service = new KiCadCheckService(
          runner as never,
          new SExpressionParser(),
          { error: jest.fn() } as never
        );
        const result = await service.runERC(schematic);
        const expected = runner.runWithProgress.mock.results[0]?.value
          ? ((await runner.runWithProgress.mock.results[0]
              .value) as RealErcViolation[])
          : [];
        const normalize = (x: string | undefined) => x ?? '';
        expect(result.diagnostics).toHaveLength(expected.length);
        const perActual = expected.map((item) =>
          [
            normalize(item.description),
            normalize(item.type),
            String(item.severity ?? 'warning').toLowerCase()
          ].join('\u001f')
        );
        const perStudio = result.diagnostics.map((d) =>
          [
            d.message,
            String(d.code),
            ['error', 'warning', 'information'][d.severity] ?? 'unknown'
          ].join('\u001f')
        );
        // Compare the full ordered KiCad finding tuple, including severity.
        expect(perStudio).toEqual(perActual);
        const links = result.diagnostics.map(
          (diagnostic) => diagnostic.relatedInformation?.[0]?.location
        );
        const linked = links.filter((location) => location !== undefined);
        const linkedChild = links.filter(
          (location, index) => location && actualSheetPaths[index] !== '/'
        );
        console.log(
          'REAL_KICAD_10_ERC_UUID_LINKS=' +
            linked.length +
            ' CHILD_SHEET_LINKS=' +
            linkedChild.length
        );
        expect(linked.length).toBe(expected.length);
        expect(linkedChild.length).toBe(6);
        for (let index = 0; index < links.length; index += 1) {
          const location = links[index];
          if (!location) continue;
          const resolved = path.relative(isolatedDir, location.uri.fsPath);
          expect(resolved).not.toMatch(/^\\.\\./);
          expect(path.isAbsolute(resolved)).toBe(false);
          const referenced = fs.readFileSync(location.uri.fsPath, 'utf8');
          expect(
            (expected[index]?.items ?? []).some(
              (item) =>
                typeof (item as { uuid?: string }).uuid === 'string' &&
                referenced.includes((item as { uuid: string }).uuid)
            )
          ).toBe(true);
          if (actualSheetPaths[index] !== '/') {
            expect(location.uri.fsPath).not.toBe(schematic);
            expect(location.range.start.line).toBeGreaterThan(0);
          }
        }
        // Real KiCad source UUID locations must drive the PRIMARY Problems
        // collection URI, not merely a related-information child link.
        const collection = new KiCadDiagnosticsAggregator({
          name: 'kicad-studio-real-erc',
          set: jest.fn(),
          delete: jest.fn(),
          clear: jest.fn(),
          forEach: jest.fn(),
          get: jest.fn(),
          has: jest.fn(),
          dispose: jest.fn(),
          *[Symbol.iterator]() {}
        } as unknown as vscode.DiagnosticCollection);
        const state = new DiagnosticStateStore(collection);
        const sourceUris = new Map<string, vscode.Uri>();
        for (const location of linked) {
          // vscodeMock.Uri.file omits scheme, unlike the real VS Code API.
          Object.defineProperty(location.uri, 'scheme', { value: 'file' });
          sourceUris.set(location.uri.fsPath, location.uri);
        }
        state.applyValidationResult(
          vscode.Uri.file(schematic),
          result.diagnostics,
          result.summary
        );
        expect(
          [...sourceUris.values()].reduce(
            (sum, uri) => sum + (collection.get(uri)?.length ?? 0),
            0
          )
        ).toBe(44);
        for (const [index, diagnostic] of result.diagnostics.entries()) {
          const target = links[index]!;
          const published = collection.get(target.uri) ?? [];
          expect(
            published.some(
              (entry) =>
                entry.message === diagnostic.message &&
                entry.code === diagnostic.code &&
                entry.range.start.line === target.range.start.line
            )
          ).toBe(true);
        }
        console.log(
          'REAL_KICAD_10_ERC_PRIMARY_PROBLEMS_LINKS=44 FILES=' + sourceUris.size
        );
        const linkedChildUri = linkedChild[0]?.uri;
        expect(linkedChildUri).toBeDefined();
        state.markStaleForResource(linkedChildUri!, 'child schematic edited');
        for (const uri of sourceUris.values()) {
          expect(
            (collection.get(uri) ?? []).every((diagnostic) =>
              diagnostic.message.startsWith('[stale]')
            )
          ).toBe(true);
        }
        expect(state.getSnapshot().erc?.freshness).toBe('stale');
        // A fresh clean ERC result must remove the previous child-file entries.
        state.applyValidationResult(vscode.Uri.file(schematic), [], {
          ...result.summary,
          errors: 0,
          warnings: 0,
          infos: 0
        });
        for (const uri of sourceUris.values()) {
          expect(collection.get(uri)).toEqual([]);
        }

        const total =
          result.summary.errors +
          result.summary.warnings +
          result.summary.infos;
        expect(total).toBe(expected.length);
        console.log(
          'REAL_KICAD_10_STUDIO_ERC_PARITY=PASS ERRORS=' +
            result.summary.errors +
            ' WARNINGS=' +
            result.summary.warnings +
            ' INFOS=' +
            result.summary.infos
        );
        expect(
          createHash('sha256').update(fs.readFileSync(schematic)).digest('hex')
        ).toBe(sourceHash);
        expect(
          createHash('sha256')
            .update(fs.readFileSync(exampleSchematic))
            .digest('hex')
        ).toBe(sourceHash);
        expect(
          fs.readFileSync(exampleSchematic).toString('base64').slice(0, 120)
        ).toBe(originalFingerprint);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
    100_000
  );
});
