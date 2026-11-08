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
  });

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
