import * as fs from 'node:fs';
import * as path from 'node:path';
import Ajv from 'ajv/dist/2020';

describe('.vscode/mcp.json KiCad schema', () => {
  const schema = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'schemas', 'vscode-mcp.kicad.json'),
      'utf8'
    )
  ) as Record<string, unknown>;

  it('accepts a valid KiCad MCP server config', () => {
    const validate = new Ajv().compile(schema);

    expect(
      validate({
        servers: {
          kicad: {
            type: 'stdio',
            command: 'uvx',
            args: ['kicad-mcp-pro'],
            env: {
              KICAD_MCP_PROFILE: 'pcb_only',
              KICAD_MCP_TRANSPORT: 'stdio',
              KICAD_MCP_PROJECT_DIR: '/project'
            }
          }
        }
      })
    ).toBe(true);
  });

  it('accepts a valid Streamable HTTP KiCad MCP server config', () => {
    const validate = new Ajv().compile(schema);

    expect(
      validate({
        servers: {
          kicad: {
            type: 'http',
            url: 'http://localhost:27185/mcp'
          }
        }
      })
    ).toBe(true);
  });

  it('rejects missing commands and bad profiles', () => {
    const validate = new Ajv({ allErrors: true }).compile(schema);

    expect(
      validate({
        servers: {
          kicad: {
            env: {
              KICAD_MCP_PROFILE: 'bad'
            }
          }
        }
      })
    ).toBe(false);
    expect(validate.errors?.map((error) => error.keyword)).toEqual(
      expect.arrayContaining(['required', 'enum'])
    );
  });

  it('allows legacy profile aliases as compatibility warnings in descriptions', () => {
    const validate = new Ajv().compile(schema);

    expect(
      validate({
        servers: {
          kicad: {
            command: 'kicad-mcp-pro',
            env: {
              KICAD_MCP_PROFILE: 'pcb'
            }
          }
        }
      })
    ).toBe(true);
    expect(JSON.stringify(schema)).toContain('Legacy aliases');
  });
});
