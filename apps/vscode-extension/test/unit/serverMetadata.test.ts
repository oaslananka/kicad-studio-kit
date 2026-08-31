import { readWellKnownMcpServerMetadata } from '../../src/mcp/serverMetadata';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('readWellKnownMcpServerMetadata', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('#622 reads the server-advertised MCP profile vocabulary from discovery', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        serverInfo: { name: 'kicad-mcp-pro', version: '3.33.3' },
        capabilities: {
          profiles: ['review', 'build', 'release', 'expert', 'pcb_only', 42]
        }
      })
    }) as typeof fetch;

    const metadata = await readWellKnownMcpServerMetadata(
      'http://127.0.0.1:27185',
      { debug: jest.fn() }
    );

    expect(metadata?.profiles).toEqual([
      'review',
      'build',
      'release',
      'expert',
      'pcb_only'
    ]);
  });

  it('#622 preserves an explicit empty profile advertisement as fail-closed evidence', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        serverInfo: { name: 'kicad-mcp-pro', version: '3.33.3' },
        capabilities: { profiles: [] }
      })
    }) as typeof fetch;

    const metadata = await readWellKnownMcpServerMetadata(
      'http://127.0.0.1:27185',
      { debug: jest.fn() }
    );

    expect(metadata?.profiles).toEqual([]);
  });

  it('#622 ignores malformed profile evidence instead of widening support', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        serverInfo: { name: 'kicad-mcp-pro', version: '3.33.3' },
        capabilities: { profiles: 'all' }
      })
    }) as typeof fetch;

    const metadata = await readWellKnownMcpServerMetadata(
      'http://127.0.0.1:27185',
      { debug: jest.fn() }
    );

    expect(metadata?.profiles).toBeUndefined();
  });
});
