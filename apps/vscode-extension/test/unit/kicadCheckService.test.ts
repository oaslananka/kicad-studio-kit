import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KiCadCheckService } from '../../src/cli/checkCommands';
import { SExpressionParser } from '../../src/language/sExpressionParser';

describe('KiCadCheckService KiCad 10 JSON diagnostics', () => {
  let workdir: string;
  let board: string;
  let schematic: string;

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-check-json-'));
    const source = `(kicad_pcb
  (footprint "U1"
    (at 12 34))
  (footprint "U2"
    (at 212 234))
)
`;
    board = path.join(workdir, 'sample.kicad_pcb');
    schematic = path.join(workdir, 'sample.kicad_sch');
    fs.writeFileSync(board, source);
    fs.writeFileSync(schematic, source);
  });

  afterEach(() => {
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  function checkService(report: unknown): KiCadCheckService {
    const cli = {
      detectCli: jest.fn().mockResolvedValue({ version: '10.0.8' }),
      runWithProgress: jest
        .fn()
        .mockImplementation(async (options: { command: string[] }) => {
          const idx = options.command.indexOf('--output');
          expect(idx).toBeGreaterThan(-1);
          const reportFile = options.command[idx + 1];
          expect(reportFile).toBeDefined();
          fs.writeFileSync(reportFile!, JSON.stringify(report), 'utf8');
        })
    };
    return new KiCadCheckService(cli as never, new SExpressionParser(), {
      error: jest.fn()
    } as never);
  }

  it('maps DRC issue positions from items[].pos exactly once, preserving type and severity', async () => {
    const service = checkService({
      violations: [
        {
          description: 'Copper clearance near U1',
          severity: 'error',
          type: 'clearance',
          items: [
            { description: 'First pad', pos: { x: 12, y: 34 }, uuid: 'a' }
          ]
        },
        {
          description: 'Board edge near U2',
          severity: 'warning',
          type: 'edge_clearance',
          items: [
            { description: 'Second pad', pos: { x: 212, y: 234 }, uuid: 'b' }
          ]
        }
      ],
      unconnected_items: []
    });
    const result = await service.runDRC(board);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.map((x) => x.message)).toEqual([
      'Copper clearance near U1',
      'Board edge near U2'
    ]);
    expect(result.diagnostics.map((x) => x.code)).toEqual([
      'clearance',
      'edge_clearance'
    ]);
    expect(result.diagnostics.map((x) => x.range.start.line)).toEqual([2, 4]);
    expect(result.summary).toEqual(
      expect.objectContaining({ source: 'drc', errors: 1, warnings: 1 })
    );
    // A disposable DRC input/report cannot be opened or replayed after
    // runCheck cleans its temporary directory.
    expect(result.summary.reportPath).toBeUndefined();
    expect(result.summary.commandArgs).toBeUndefined();
  });

  it('keeps separate KiCad courtyard overlap pairs visible when they share an anchor footprint', async () => {
    const service = checkService({
      violations: [
        {
          description: 'Courtyards overlap',
          severity: 'error',
          type: 'courtyards_overlap',
          items: [
            { description: 'Footprint J1', pos: { x: 12, y: 34 } },
            { description: 'Footprint C2', pos: { x: 212, y: 234 } }
          ]
        },
        {
          description: 'Courtyards overlap',
          severity: 'error',
          type: 'courtyards_overlap',
          items: [
            { description: 'Footprint J1', pos: { x: 12, y: 34 } },
            { description: 'Footprint L1', pos: { x: 200, y: 200 } }
          ]
        }
      ]
    });
    const result = await service.runDRC(board);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.map((item) => item.message)).toEqual([
      'Courtyards overlap — Footprint J1 / Footprint C2',
      'Courtyards overlap — Footprint J1 / Footprint L1'
    ]);
    expect(result.diagnostics[0]?.range.start.line).toBe(
      result.diagnostics[1]?.range.start.line
    );
    expect(new Set(result.diagnostics.map((item) => item.message)).size).toBe(
      2
    );
  });

  it('navigates small KiCad PCB DRC findings to the matching object UUID, not a nearby footprint', async () => {
    const uuid = '22222222-2222-4222-8222-222222222222';
    const source = [
      '(kicad_pcb',
      '  (footprint "wrong-closest" (at 10 10) (uuid "11111111-1111-4111-8111-111111111111"))',
      '  (footprint "actual-pad" (at 200 200)',
      '    (pad "1" smd rect (at 0 0)',
      '      (uuid "' + uuid + '")))',
      ')'
    ].join('\n');
    fs.writeFileSync(board, source, 'utf8');
    const service = checkService({
      violations: [
        {
          description: 'Clearance violation on actual pad',
          severity: 'error',
          type: 'clearance',
          items: [{ uuid, pos: { x: 10, y: 10 } }]
        },
        {
          description: 'Unknown item falls back to nearby source coordinate',
          severity: 'warning',
          type: 'clearance',
          items: [
            {
              uuid: '99999999-9999-4999-8999-999999999999',
              pos: { x: 10, y: 10 }
            }
          ]
        }
      ]
    });
    const result = await service.runDRC(board);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.map((item) => item.range.start.line)).toEqual([
      4, 1
    ]);
    expect(result.summary.errors).toBe(1);
    expect(result.summary.warnings).toBe(1);
  });

  it('runs DRC from an isolated project snapshot without writing a user project sidecar', async () => {
    const project = path.join(workdir, 'sample.kicad_pro');
    const rules = path.join(workdir, 'sample.kicad_dru');
    const footprintTable = path.join(workdir, 'fp-lib-table');
    const boardText = fs.readFileSync(board, 'utf8');
    fs.writeFileSync(project, '{"board":{"design_settings":{}}}');
    fs.writeFileSync(rules, '(version 1) (rule "Clearance")');
    fs.writeFileSync(footprintTable, '(fp_lib_table)');
    let cliRoot = '';
    const cli = {
      detectCli: jest.fn().mockResolvedValue({ version: '10.0.8' }),
      runWithProgress: jest.fn(
        async ({ command, cwd }: { command: string[]; cwd: string }) => {
          cliRoot = cwd;
          const pcb = command.at(-1)!;
          const output = command[command.indexOf('--output') + 1]!;
          expect(cwd).not.toBe(workdir);
          expect(pcb).toBe(path.join(cwd, 'sample.kicad_pcb'));
          expect(fs.readFileSync(pcb, 'utf8')).toBe(boardText);
          expect(
            fs.readFileSync(path.join(cwd, 'sample.kicad_pro'), 'utf8')
          ).toBe(fs.readFileSync(project, 'utf8'));
          expect(
            fs.readFileSync(path.join(cwd, 'sample.kicad_dru'), 'utf8')
          ).toBe(fs.readFileSync(rules, 'utf8'));
          expect(fs.readFileSync(path.join(cwd, 'fp-lib-table'), 'utf8')).toBe(
            fs.readFileSync(footprintTable, 'utf8')
          );
          expect(path.dirname(output)).toBe(cwd);
          // Real KiCad CLI DRC can create this project-local metadata file.
          fs.writeFileSync(path.join(cwd, 'sample.kicad_prl'), '{}');
          fs.writeFileSync(
            output,
            JSON.stringify({
              violations: [
                {
                  description: 'Insufficient clearance',
                  type: 'clearance',
                  severity: 'error',
                  items: [{ pos: { x: 12, y: 34 } }]
                }
              ]
            })
          );
        }
      )
    };
    const service = new KiCadCheckService(
      cli as never,
      new SExpressionParser(),
      { error: jest.fn() } as never
    );
    const result = await service.runDRC(board);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.summary).toEqual(
      expect.objectContaining({
        file: board,
        source: 'drc',
        errors: 1,
        warnings: 0
      })
    );
    expect(fs.readFileSync(board, 'utf8')).toBe(boardText);
    expect(fs.existsSync(path.join(workdir, 'sample.kicad_prl'))).toBe(false);
    expect(cliRoot).not.toBe('');
    expect(fs.existsSync(cliRoot)).toBe(false);
  });

  it('stages referenced project-local KiCad footprint and symbol libraries for real DRC truth', async () => {
    const localDir = path.join(workdir, 'libs');
    const footprint = path.join(localDir, 'part.pretty', 'U1.kicad_mod');
    const symbol = path.join(localDir, 'parts.kicad_sym');
    fs.mkdirSync(path.dirname(footprint), { recursive: true });
    fs.writeFileSync(footprint, '(footprint "U1")');
    fs.writeFileSync(symbol, '(kicad_symbol_lib)');
    fs.writeFileSync(
      path.join(workdir, 'fp-lib-table'),
      '(fp_lib_table (lib (name "parts")(type "KiCad")(uri "${KIPRJMOD}/libs/part.pretty")))'
    );
    fs.writeFileSync(
      path.join(workdir, 'sym-lib-table'),
      '(sym_lib_table (lib (name "parts")(type "KiCad")(uri "${KIPRJMOD}/libs/parts.kicad_sym")))'
    );
    let tempDir = '';
    const cli = {
      detectCli: jest.fn().mockResolvedValue({ version: '10.0.8' }),
      runWithProgress: jest.fn(
        async ({ command, cwd }: { command: string[]; cwd: string }) => {
          tempDir = cwd;
          expect(
            fs.readFileSync(
              path.join(cwd, 'libs', 'part.pretty', 'U1.kicad_mod'),
              'utf8'
            )
          ).toContain('U1');
          expect(
            fs.readFileSync(path.join(cwd, 'libs', 'parts.kicad_sym'), 'utf8')
          ).toContain('kicad_symbol_lib');
          const output = command[command.indexOf('--output') + 1]!;
          fs.writeFileSync(output, JSON.stringify({ violations: [] }));
        }
      )
    };
    const service = new KiCadCheckService(
      cli as never,
      new SExpressionParser(),
      {
        error: jest.fn()
      } as never
    );
    const result = await service.runDRC(board);
    expect(result.diagnostics).toHaveLength(0);
    expect(fs.existsSync(tempDir)).toBe(false);
    expect(fs.readFileSync(footprint, 'utf8')).toContain('U1');
    expect(fs.readFileSync(symbol, 'utf8')).toContain('kicad_symbol_lib');
  });

  (process.platform === 'win32' ? it.skip : it)(
    'rejects project-library symlinks rather than reporting incomplete DRC results',
    async () => {
      const localDir = path.join(workdir, 'libs');
      fs.mkdirSync(localDir, { recursive: true });
      const external = fs.mkdtempSync(
        path.join(os.tmpdir(), 'outside-kicad-library-')
      );
      try {
        fs.writeFileSync(
          path.join(external, 'private.kicad_mod'),
          '(footprint "external")'
        );
        fs.symlinkSync(external, path.join(localDir, 'linked.pretty'), 'dir');
        fs.writeFileSync(
          path.join(workdir, 'fp-lib-table'),
          '(fp_lib_table (lib (name "linked")(type "KiCad")(uri "${KIPRJMOD}/libs/linked.pretty")))'
        );
        const cli = {
          detectCli: jest.fn(),
          runWithProgress: jest.fn()
        };
        const service = new KiCadCheckService(
          cli as never,
          new SExpressionParser(),
          {
            error: jest.fn()
          } as never
        );
        await expect(service.runDRC(board)).rejects.toThrow('symlink');
        expect(cli.runWithProgress).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(external, { recursive: true, force: true });
      }
    }
  );

  it('rejects stale DRC findings when project rules change while KiCad is running', async () => {
    const project = path.join(workdir, 'sample.kicad_pro');
    fs.writeFileSync(project, '{"version":1}');
    let cliRoot = '';
    const cli = {
      detectCli: jest.fn().mockResolvedValue({ version: '10.0.8' }),
      runWithProgress: jest.fn(
        async ({ command, cwd }: { command: string[]; cwd: string }) => {
          cliRoot = cwd;
          fs.writeFileSync(
            command[command.indexOf('--output') + 1]!,
            '{"violations":[]}'
          );
          // A changed KiCad project ruleset makes the just-produced DRC
          // report untrustworthy, even if the PCB itself is unchanged.
          fs.writeFileSync(project, '{"version":1000}');
        }
      )
    };
    const service = new KiCadCheckService(
      cli as never,
      new SExpressionParser(),
      { error: jest.fn() } as never
    );
    await expect(service.runDRC(board)).rejects.toThrow(
      'The KiCad project changed during DRC'
    );
    expect(fs.existsSync(cliRoot)).toBe(false);
    expect(fs.existsSync(path.join(workdir, 'sample.kicad_prl'))).toBe(false);
  });

  it('keeps ERC on the true schematic path to retain hierarchical sheets', async () => {
    const cli = {
      detectCli: jest.fn().mockResolvedValue({ version: '10.0.8' }),
      runWithProgress: jest.fn(
        async ({ command, cwd }: { command: string[]; cwd: string }) => {
          expect(cwd).toBe(workdir);
          expect(command.at(-1)).toBe(schematic);
          fs.writeFileSync(
            command[command.indexOf('--output') + 1]!,
            '{"sheets":[]}'
          );
        }
      )
    };
    const service = new KiCadCheckService(
      cli as never,
      new SExpressionParser(),
      { error: jest.fn() } as never
    );
    const result = await service.runERC(schematic);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.summary.file).toBe(schematic);
  });

  const cliPath = path.join(
    process.env['ProgramFiles'] ?? String.raw`C:\Program Files`,
    'KiCad',
    '10.0',
    'bin',
    'kicad-cli.exe'
  );
  const nativeDemo = path.join(
    process.env['ProgramFiles'] ?? String.raw`C:\Program Files`,
    'KiCad',
    '10.0',
    'share',
    'kicad',
    'demos',
    'royalblue54L_feather'
  );
  const runNative =
    process.platform === 'win32' &&
    process.env['KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE'] === '1' &&
    fs.existsSync(cliPath) &&
    fs.existsSync(path.join(nativeDemo, 'RoyalBlue54L-Feather.kicad_pcb'));
  (runNative ? it : it.skip)(
    'matches actual KiCad 10 DRC JSON issues and severity on an unchanged temporary real PCB',
    async () => {
      const basename = 'RoyalBlue54L-Feather';
      const boardInput = path.join(workdir, `${basename}.kicad_pcb`);
      const projectInput = path.join(workdir, `${basename}.kicad_pro`);
      fs.copyFileSync(
        path.join(nativeDemo, `${basename}.kicad_pcb`),
        boardInput
      );
      fs.copyFileSync(
        path.join(nativeDemo, `${basename}.kicad_pro`),
        projectInput
      );
      const hashFile = (file: string): string =>
        createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      const beforeBoard = hashFile(boardInput);
      const beforeProject = hashFile(projectInput);
      let report:
        | {
            violations: Array<{
              severity: string;
              type: string;
              items?: Array<{ uuid?: unknown }>;
            }>;
            unconnected_items: Array<{
              severity: string;
              type: string;
              items?: Array<{ uuid?: unknown }>;
            }>;
            schematic_parity: Array<{
              severity: string;
              type: string;
              items?: Array<{ uuid?: unknown }>;
            }>;
          }
        | undefined;
      let disposableDir = '';
      const cli = {
        detectCli: jest.fn().mockResolvedValue({ version: '10.0.8' }),
        runWithProgress: jest.fn(
          async ({ command, cwd }: { command: string[]; cwd: string }) => {
            disposableDir = cwd;
            expect(command.at(-1)).not.toBe(boardInput);
            expect(
              fs.readFileSync(path.join(cwd, `${basename}.kicad_pro`), 'utf8')
            ).toBe(fs.readFileSync(projectInput, 'utf8'));
            const execution = spawnSync(cliPath, command, {
              cwd,
              encoding: 'utf8',
              timeout: 120_000
            });
            if (execution.error || execution.status !== 0) {
              throw new Error(
                'Native KiCad DRC failed to execute: ' +
                  String(execution.error ?? execution.stderr)
              );
            }
            const output = command[command.indexOf('--output') + 1]!;
            report = JSON.parse(fs.readFileSync(output, 'utf8'));
            expect(fs.existsSync(path.join(cwd, `${basename}.kicad_prl`))).toBe(
              true
            );
          }
        )
      };
      const service = new KiCadCheckService(
        cli as never,
        new SExpressionParser(),
        { error: jest.fn() } as never
      );
      const result = await service.runDRC(boardInput);
      expect(report).toBeDefined();
      const issues = [
        ...(report?.violations ?? []),
        ...(report?.unconnected_items ?? []),
        ...(report?.schematic_parity ?? [])
      ];
      expect(issues.length).toBeGreaterThan(0);
      const count = (severity: string): number =>
        issues.filter((row) => row.severity === severity).length;
      expect(result.diagnostics).toHaveLength(issues.length);
      expect(result.summary.errors).toBe(count('error'));
      expect(result.summary.warnings).toBe(count('warning'));
      expect(result.summary.infos).toBe(
        issues.length - count('error') - count('warning')
      );
      expect(result.diagnostics.map((item) => item.code)).toEqual(
        issues.map((item) => item.type)
      );
      const pcbLines = fs.readFileSync(boardInput, 'utf8').split(/\r?\n/);
      const genuineUuidRows = issues.reduce((count, issue, index) => {
        const line = result.diagnostics[index]?.range.start.line;
        const sourceLine =
          typeof line === 'number' ? pcbLines[line]?.toLowerCase() : undefined;
        if (!sourceLine || !Array.isArray(issue.items)) return count;
        return (
          count +
          Number(
            issue.items.some(
              (item: { uuid?: unknown }) =>
                typeof item.uuid === 'string' &&
                sourceLine.includes(item.uuid.toLowerCase())
            )
          )
        );
      }, 0);
      console.log(
        'REAL_KICAD_SMALL_DRC_UUID_ROWS=' +
          JSON.stringify({ genuineUuidRows, issues: issues.length })
      );
      expect(genuineUuidRows).toBe(issues.length);
      expect(hashFile(boardInput)).toBe(beforeBoard);
      expect(hashFile(projectInput)).toBe(beforeProject);
      expect(fs.existsSync(path.join(workdir, `${basename}.kicad_prl`))).toBe(
        false
      );
      expect(disposableDir).not.toBe('');
      expect(fs.existsSync(disposableDir)).toBe(false);
      console.log(
        'REAL_KICAD_DRC_PARITY=' +
          JSON.stringify({
            issues: issues.length,
            errors: result.summary.errors,
            warnings: result.summary.warnings,
            userProjectSidecars: 0,
            immutable: true
          })
      );
    },
    155_000
  );

  it('reads nested KiCad 10 ERC sheet violations and item coordinates', async () => {
    const service = checkService({
      sheets: [
        {
          path: '/root',
          violations: [
            {
              description: 'Unconnected output pin',
              severity: 'warning',
              type: 'pin_not_connected',
              items: [
                {
                  description: 'U2 output pin',
                  pos: { x: 212, y: 234 },
                  uuid: 'c'
                }
              ]
            }
          ]
        }
      ]
    });
    const result = await service.runERC(schematic);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('pin_not_connected');
    expect(result.diagnostics[0]?.range.start.line).toBe(4);
    expect(result.summary).toEqual(
      expect.objectContaining({ source: 'erc', warnings: 1, errors: 0 })
    );
  });
  it('does not fabricate root-sheet coordinates for an unverified child-sheet source UUID', async () => {
    const service = checkService({
      sheets: [
        {
          path: '/Power/',
          uuid_path:
            '/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222',
          violations: [
            {
              description: 'A child power pin that cannot be mapped',
              severity: 'error',
              type: 'power_pin_not_driven',
              items: [
                {
                  uuid: '33333333-3333-4333-8333-333333333333',
                  pos: { x: 212, y: 234 }
                }
              ]
            }
          ]
        }
      ]
    });
    const result = await service.runERC(schematic);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.range.start.line).toBe(0);
    expect(result.diagnostics[0]?.relatedInformation).toBeUndefined();
    expect(result.summary.errors).toBe(1);
  });

  it('ignores KiCad ERC rule catalog descriptions while counting real violations', async () => {
    const service = checkService({
      erc: {
        rules: [
          { description: 'Global label only appears once in the schematic' },
          { description: 'Four connection points are joined together' },
          { description: 'Unused footprint library', severity: 'warning' }
        ]
      },
      sheets: [
        {
          path: '/root',
          violations: [
            {
              description: 'Symbol pin not connected',
              severity: 'warning',
              type: 'pin_not_connected',
              items: [
                { description: 'Connection point', pos: { x: 12, y: 34 } }
              ]
            }
          ]
        }
      ]
    });
    const result = await service.runERC(schematic);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toBe('Symbol pin not connected');
    expect(result.diagnostics[0]?.code).toBe('pin_not_connected');
    expect(result.summary.warnings).toBe(1);
  });
});
