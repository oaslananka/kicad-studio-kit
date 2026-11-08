import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ErcSourceLocations } from '../../src/cli/ercSourceLocations';
import { KiCadCheckService } from '../../src/cli/checkCommands';
import { SExpressionParser } from '../../src/language/sExpressionParser';

const ROOT = '11111111-1111-4111-8111-111111111111';
const PAGE = '22222222-2222-4222-8222-222222222222';
const TARGET = '33333333-3333-4333-8333-333333333333';
const ROOT_TARGET = '44444444-4444-4444-8444-444444444444';

describe('KiCad 10 ERC UUID-path navigation — exact file and object', () => {
  let dir: string;
  let root: string;
  let child: string;
  const sheet = { path: '/Debugger/', uuidPath: `/${ROOT}/${PAGE}` };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-erc-locations-'));
    const sub = path.join(dir, 'sch');
    fs.mkdirSync(sub);
    root = path.join(dir, 'root.kicad_sch');
    child = path.join(sub, 'custom-filename.kicad_sch');
    fs.writeFileSync(
      root,
      `(kicad_sch
  (version 20250114)
  (uuid "${ROOT}")
  (symbol (lib_id "Device:R") (at 4 5) (uuid "${ROOT_TARGET}"))
  (sheet
    (at 2 3)
    (uuid "${PAGE}")
    (property "Sheetname" "Debugger")
    (property "Sheetfile" "sch/custom-filename.kicad_sch")
  )
)`
    );
    fs.writeFileSync(
      child,
      `(kicad_sch
  (version 20250114)
  (uuid "55555555-5555-4555-8555-555555555555")
  (symbol (lib_id "Device:R") (at 21 45)
    (uuid "${TARGET}"))
)`
    );
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('follows true UUID_path -> Sheetfile (not the display name) and exact object UUID', () => {
    const resolved = new ErcSourceLocations(
      root,
      new SExpressionParser()
    ).resolve(sheet, [{ uuid: TARGET, pos: { x: 21, y: 45 } }]);
    expect(resolved?.uri.fsPath).toBe(child);
    expect(resolved?.range.start.line).toBe(3);
    expect(fs.readFileSync(child, 'utf8')).toContain(TARGET);
  });

  it('resolves root issues to the root schematic without confusing sheet coordinates', () => {
    const resolved = new ErcSourceLocations(
      root,
      new SExpressionParser()
    ).resolve({ path: '/', uuidPath: `/${ROOT}` }, [{ uuid: ROOT_TARGET }]);
    expect(resolved?.uri.fsPath).toBe(root);
    expect(resolved?.range.start.line).toBe(3);
  });

  it('resolves root-catalog findings to the unique child sheet UUID, never the root', () => {
    const resolver = new ErcSourceLocations(root, new SExpressionParser());
    const location = resolver.resolve({ path: '/', uuidPath: `/${ROOT}` }, [
      { uuid: TARGET, pos: { x: 21, y: 45 } }
    ]);
    expect(location?.uri.fsPath).toBe(child);
    expect(location?.range.start.line).toBe(3);
  });

  it('rejects a root finding when two declared sheets share the same object UUID', () => {
    const other = path.join(dir, 'sch', 'other.kicad_sch');
    fs.writeFileSync(
      other,
      `(kicad_sch (uuid "66666666-6666-4666-8666-666666666666")
      (symbol (lib_id "Device:R") (at 4 5) (uuid "${TARGET}")))`
    );
    const rootSource = fs.readFileSync(root, 'utf8');
    fs.writeFileSync(
      root,
      rootSource.replace(
        /\)\s*$/,
        `
      (sheet (uuid "77777777-7777-4777-8777-777777777777")
        (property "Sheetname" "Other")
        (property "Sheetfile" "sch/other.kicad_sch"))
    )`
      )
    );
    const location = new ErcSourceLocations(
      root,
      new SExpressionParser()
    ).resolve({ path: '/', uuidPath: `/${ROOT}` }, [{ uuid: TARGET }]);
    expect(location).toBeUndefined();
  });

  it('fails closed on wrong sheet UUID, forged path or absent object', () => {
    const resolver = new ErcSourceLocations(root, new SExpressionParser());
    expect(
      resolver.resolve({ ...sheet, uuidPath: `/${ROOT}/${TARGET}` }, [
        { uuid: TARGET }
      ])
    ).toBeUndefined();
    expect(
      resolver.resolve({ ...sheet, path: '/Connectors/' }, [{ uuid: TARGET }])
    ).toBeUndefined();
    expect(resolver.resolve(sheet, [{ uuid: ROOT_TARGET }])).toBeUndefined();
    expect(
      resolver.resolve(sheet, [{ uuid: 'not-a-valid-uuid' }])
    ).toBeUndefined();
  });

  it('does not resolve sheet files that escape the original project directory', () => {
    fs.writeFileSync(
      root,
      `(kicad_sch (uuid "${ROOT}")
        (sheet (uuid "${PAGE}")
          (property "Sheetname" "Debugger")
          (property "Sheetfile" "../untrusted.kicad_sch")))`
    );
    const external = path.join(path.dirname(dir), 'untrusted.kicad_sch');
    try {
      fs.writeFileSync(external, `(kicad_sch (uuid "${TARGET}"))`);
      const resolver = new ErcSourceLocations(root, new SExpressionParser());
      expect(resolver.resolve(sheet, [{ uuid: TARGET }])).toBeUndefined();
    } finally {
      fs.rmSync(external, { force: true });
    }
  });

  it('adds a navigable exact related URI to a nested ERC diagnostic, never inventing root coordinates', async () => {
    const fakeRunner = {
      detectCli: jest.fn().mockResolvedValue({ version: '10.0.8' }),
      runWithProgress: jest
        .fn()
        .mockImplementation(async ({ command }: { command: string[] }) => {
          const output = command[command.indexOf('--output') + 1];
          fs.writeFileSync(
            output!,
            JSON.stringify({
              sheets: [
                { path: '/', uuid_path: `/${ROOT}`, violations: [] },
                {
                  path: sheet.path,
                  uuid_path: sheet.uuidPath,
                  violations: [
                    {
                      description: 'Unconnected power pin on Debugger',
                      type: 'power_pin_not_driven',
                      severity: 'error',
                      items: [{ uuid: TARGET, pos: { x: 21, y: 45 } }]
                    }
                  ]
                }
              ]
            })
          );
        })
    };
    const service = new KiCadCheckService(
      fakeRunner as never,
      new SExpressionParser(),
      { error: jest.fn() } as never
    );
    const result = await service.runERC(root);
    expect(result.diagnostics).toHaveLength(1);
    const issue = result.diagnostics[0]!;
    expect(issue.message).toBe('Unconnected power pin on Debugger');
    expect(issue.code).toBe('power_pin_not_driven');
    expect(issue.range.start.line).toBe(0);
    expect(issue.relatedInformation).toHaveLength(1);
    expect(issue.relatedInformation?.[0]?.location.uri.fsPath).toBe(child);
    expect(issue.relatedInformation?.[0]?.location.range.start.line).toBe(3);
    expect(result.summary.errors).toBe(1);
    expect(fs.readFileSync(root, 'utf8')).toContain(ROOT);
  });
});
