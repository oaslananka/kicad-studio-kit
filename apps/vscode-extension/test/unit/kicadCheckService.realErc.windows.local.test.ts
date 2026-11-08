import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { KiCadCheckService } from '../../src/cli/checkCommands';
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
                  sheets: { violations: RealErcViolation[] }[];
                };
                const expected = json.sheets.flatMap(
                  (sheet) => sheet.violations ?? []
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
