import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { COMMANDS, EXTENSION_ID, SETTINGS } from '../../../src/constants';
import { isMcpVersionSupported } from '../../../src/mcp/compat';
import { MCP_PROTOCOL_VERSION } from '../../../src/mcp/compatibilityMatrix';
import { McpClient } from '../../../src/mcp/mcpClient';
import { Logger } from '../../../src/utils/logger';
import type { QualityGateResult } from '../../../src/types';
import { withPublishedStatelessServer, withRealServer } from './setup';
import {
  Mcp2026InvalidDiscoveryError,
  Mcp2026ProtocolAdapter,
  Mcp2026UnsupportedResultError
} from '../../../src/mcp/protocol/mcp2026ProtocolAdapter';
import {
  resolveMcpProtocolAdapter,
  UnsupportedMcpProtocolVersionError
} from '../../../src/mcp/protocol/protocolAdapterRegistry';
import { Mcp2025ProtocolAdapter } from '../../../src/mcp/protocol/mcp2025ProtocolAdapter';
import { McpProtocolLifecycle } from '../../../src/mcp/protocol/protocolLifecycle';
import type { McpDiscoveryResult } from '../../../src/mcp/protocol/protocolAdapter';
import {
  HttpJsonRpcTransport,
  McpHttpError,
  McpRequestTimeoutError
} from '../../../src/mcp/transport/httpJsonRpcTransport';

const REQUIRED_EXTENSION_HOST_TOOLS = [
  'project_quality_gate_report',
  'pcb_placement_quality_gate',
  'pcb_transfer_quality_gate'
] as const;

suite('Real Pair Extension Host', () => {
  test('connects KiCad Studio commands to the real MCP server', async function () {
    this.timeout(180000);

    if (MCP_PROTOCOL_VERSION === '2026-07-28') {
      await assertPublishedActive2026ExtensionHost();
      return;
    }

    await withRealServer(async (server) => {
      const tools = await server.listTools();
      for (const tool of REQUIRED_EXTENSION_HOST_TOOLS) {
        assert.ok(tools.includes(tool), `Missing real-pair tool ${tool}`);
      }

      await configureMcpEndpoint(server.endpoint);

      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(
        extension,
        `Expected extension ${EXTENSION_ID} to be installed.`
      );
      await extension.activate();
      assert.strictEqual(extension.isActive, true);

      await vscode.commands.executeCommand(COMMANDS.retryMcp);
      await vscode.commands.executeCommand(
        COMMANDS.qualityGateRunThis,
        placementGate()
      );

      if (process.env['REAL_SERVER_PYPI_VERSION']) {
        // This is the *actual* VS Code Host process: the extension stays on
        // 2025 while a separate staged 2026 client uses a stateless peer.
        assert.throws(
          () => resolveMcpProtocolAdapter('2026-07-28'),
          UnsupportedMcpProtocolVersionError
        );
        await withPublishedStatelessServer(async (modernEndpoint) => {
          const outgoing: Headers[] = [];
          const sessions: Array<string | undefined> = [];
          const discoveries: McpDiscoveryResult[] = [];
          const modern = new McpProtocolLifecycle({
            adapter: new Mcp2026ProtocolAdapter(),
            clientInfo: { name: 'kicad-studio', version: '1.17.1' },
            sessionStore: {
              read: () => 'forged-2025-session',
              write: async (session) => {
                sessions.push(session);
              }
            },
            transport: new HttpJsonRpcTransport({
              logger: { debug() {}, warn() {} },
              maxRetries: 1,
              trafficLogger: {
                recordRequest: (_method, _payload, headers) => {
                  outgoing.push(new Headers(headers));
                },
                recordResponse() {},
                recordError() {}
              }
            })
          });
          // Full Studio client acceptance: the production connection/state and
          // callTool implementation must also work with the final adapter,
          // not merely the lower-level adapter/transport in this Host.
          const stored = new Map<string, unknown>();
          const clientContext = {
            extension: { packageJSON: { version: '1.17.1' } },
            globalState: {
              get: <T>(key: string): T | undefined =>
                stored.get(key) as T | undefined,
              update: async (key: string, value: unknown) => {
                stored.set(key, value);
              }
            }
          } as unknown as vscode.ExtensionContext;
          const detector = {
            detectKicadMcpPro: async () => ({ found: true, source: 'uvx' })
          } as unknown as ConstructorParameters<typeof McpClient>[1];
          const clientLogger = new Logger('MCP 2026 Acceptance');
          try {
            await configureMcpEndpoint(`${modernEndpoint}/mcp`);
            const actualClient = new McpClient(
              clientContext,
              detector,
              clientLogger,
              {
                protocolAdapter: new Mcp2026ProtocolAdapter(),
                maxRetries: 1
              }
            );
            const actualState = await actualClient.testConnection();
            assert.equal(
              actualState.kind,
              'Connected',
              `The full Studio client must connect over MCP 2026: ${actualState.message ?? ''}`
            );
            const actualVersion = await actualClient.callTool(
              'kicad_get_version',
              {}
            );
            assert.ok(
              actualVersion,
              'The full Studio client must decode 2026 tools/call'
            );
            assert.match(
              JSON.stringify(actualVersion),
              /KiCad MCP Pro Server v4\.3\.0/u,
              'The published version tool must report the pinned 4.3.0 server'
            );
            assert.ok(
              !stored.has('kicadstudio.mcp.sessionId'),
              'MCP 2026 must not persist legacy session state'
            );
          } finally {
            await configureMcpEndpoint(server.endpoint);
            clientLogger.dispose();
          }

          const runtime = {
            baseEndpoint: modernEndpoint,
            allowLegacySse: false,
            timeoutMs: 20_000,
            hasDiscoveryState: false
          };
          const onDiscovery = (result: McpDiscoveryResult | undefined) => {
            assert.ok(result);
            discoveries.push(result);
          };
          await modern.ensureReady(runtime, { onDiscovery });
          await modern.ensureReady(
            { ...runtime, hasDiscoveryState: true },
            { onDiscovery }
          );
          assert.equal(
            discoveries.length,
            2,
            'modern discovery must not reuse a stale 2025 card'
          );
          for (const discovery of discoveries) {
            assert.ok(Number.isSafeInteger(discovery.ttlMs));
            assert.ok(discovery.ttlMs !== undefined && discovery.ttlMs >= 0);
            assert.ok(
              discovery.cacheScope === 'private' ||
                discovery.cacheScope === 'public'
            );
          }
          const tools = await modern.execute<{
            tools: Array<{ name: string }>;
          }>('tools/list', {}, runtime);
          assert.equal(tools.json.error, undefined);
          assert.ok(
            tools.json.result?.tools.some(
              (tool) => tool.name === 'kicad_get_version'
            )
          );
          const call = await modern.execute<{ isError?: boolean }>(
            'tools/call',
            { name: 'kicad_get_version', arguments: {} },
            runtime
          );
          assert.equal(call.json.error, undefined);
          assert.notEqual(call.json.result?.isError, true);
          assert.deepEqual(
            sessions,
            [],
            '2026 must not persist 2025 session state'
          );
          assert.ok(outgoing.length >= 4);
          assert.ok(
            outgoing.every(
              (h) => h.get('MCP-Protocol-Version') === '2026-07-28'
            )
          );
          assert.ok(outgoing.every((h) => !h.has('MCP-Session-Id')));
          assert.equal(outgoing.at(-1)?.get('Mcp-Name'), 'kicad_get_version');
        });
        // Isolated rollback drill: after exercising the staged stateless peer,
        // establish a *fresh* session with the published 2025 peer and make a
        // real read-only tool call. No production selector or rollout is changed.
        const rollbackRequests: Array<{ method: string; headers: Headers }> =
          [];
        const persistedSessions: Array<string | undefined> = [];
        const rollback = new McpProtocolLifecycle({
          adapter: new Mcp2025ProtocolAdapter(),
          clientInfo: { name: 'kicad-studio', version: '1.17.1' },
          sessionStore: {
            read: () => undefined,
            write: async (session) => {
              persistedSessions.push(session);
            }
          },
          transport: new HttpJsonRpcTransport({
            logger: { debug() {}, warn() {} },
            maxRetries: 1,
            trafficLogger: {
              recordRequest: (method, _payload, headers) => {
                rollbackRequests.push({
                  method,
                  headers: new Headers(headers)
                });
              },
              recordResponse() {},
              recordError() {}
            }
          })
        });
        const rollbackRuntime = {
          baseEndpoint: server.endpoint.replace(/\/mcp$/u, ''),
          allowLegacySse: false,
          timeoutMs: 20_000,
          hasDiscoveryState: false
        };
        await rollback.ensureReady(rollbackRuntime, { onDiscovery() {} });
        const recovered = await rollback.execute<{
          tools: Array<{ name: string }>;
        }>('tools/list', {}, rollbackRuntime);
        assert.equal(recovered.json.error, undefined);
        assert.ok(
          recovered.json.result?.tools.some(
            (tool) => tool.name === 'kicad_get_version'
          )
        );
        const rolledBackCall = await rollback.execute<{ isError?: boolean }>(
          'tools/call',
          { name: 'kicad_get_version', arguments: {} },
          rollbackRuntime
        );
        assert.equal(rolledBackCall.json.error, undefined);
        assert.notEqual(rolledBackCall.json.result?.isError, true);
        assert.ok(
          persistedSessions.some(
            (value) => typeof value === 'string' && value.length > 0
          )
        );
        assert.equal(rollbackRequests[0]?.method, 'initialize');
        assert.equal(rollbackRequests[0]?.headers.get('MCP-Session-Id'), null);
        assert.ok(
          rollbackRequests
            .slice(1)
            .every(
              ({ headers }) =>
                headers.has('MCP-Session-Id') &&
                headers.get('MCP-Protocol-Version') === '2025-11-25' &&
                !headers.has('Mcp-Name') &&
                !headers.has('Authorization')
            )
        );

        // The production extension must still work on its existing 2025 peer
        // after the staged modern peer has been used in the same Host process.
        await vscode.commands.executeCommand(COMMANDS.retryMcp);
        const legacy = await server.listTools();
        assert.ok(legacy.includes('kicad_get_version'));
      }

      const version = server.initializeResult.serverInfo?.version;
      assert.ok(
        isMcpVersionSupported(version),
        `Expected compatible real MCP server version, got ${version ?? 'unknown'}`
      );

      const qualityGate = await server.readResource(
        'kicad://project/quality_gate'
      );
      assert.match(qualityGate, /Project quality gate:/);
    });
  });

  test('fails closed on unsupported MRTR, invalid discovery and stalled responses', async function () {
    this.timeout(15000);
    if (!process.env['REAL_SERVER_PYPI_VERSION']) return;

    const runtime = {
      baseEndpoint: 'http://127.0.0.1:19997',
      allowLegacySse: false,
      timeoutMs: 40,
      hasDiscoveryState: false
    };
    const makeLifecycle = (fetchFn: typeof fetch) =>
      new McpProtocolLifecycle({
        adapter: new Mcp2026ProtocolAdapter(),
        clientInfo: { name: 'kicad-studio', version: '1.17.1' },
        sessionStore: {
          read: () => 'persisted-2025-session',
          write: async () => {
            assert.fail('2026 must not persist legacy sessions');
          }
        },
        transport: new HttpJsonRpcTransport({
          fetchFn,
          logger: { debug() {}, warn() {} },
          maxRetries: 1
        })
      });
    const rpcResponse = (result: unknown) =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
        headers: { 'Content-Type': 'application/json' }
      });

    const mrtr = makeLifecycle(async () =>
      rpcResponse({ resultType: 'input_required', inputRequests: {} })
    );
    await assert.rejects(
      mrtr.execute(
        'tools/call',
        { name: 'kicad_get_version', arguments: {} },
        runtime
      ),
      Mcp2026UnsupportedResultError
    );

    let acceptedDiscovery = false;
    const malformed = makeLifecycle(async () =>
      rpcResponse({
        resultType: 'complete',
        supportedVersions: ['2026-07-28'],
        capabilities: {},
        ttlMs: -1,
        cacheScope: 'public'
      })
    );
    await assert.rejects(
      malformed.ensureReady(runtime, {
        onDiscovery: () => {
          acceptedDiscovery = true;
        }
      }),
      Mcp2026InvalidDiscoveryError
    );
    assert.equal(acceptedDiscovery, false);

    const refused = makeLifecycle(
      async () => new Response('unavailable', { status: 503 })
    );
    await assert.rejects(
      refused.execute('tools/list', {}, runtime),
      (error: unknown) => error instanceof McpHttpError && error.status === 503
    );

    for (const encoding of ['json', 'sse'] as const) {
      const stalled = makeLifecycle(
        async () =>
          ({
            ok: true,
            status: 200,
            headers: new Headers({
              'Content-Type':
                encoding === 'json' ? 'application/json' : 'text/event-stream'
            }),
            json: () => new Promise<never>(() => undefined),
            text: () => new Promise<never>(() => undefined)
          }) as unknown as Response
      );
      await assert.rejects(
        stalled.execute('tools/list', {}, runtime),
        McpRequestTimeoutError,
        `${encoding} stalled body must time out`
      );
    }
    // A malicious discovery card is server-controlled display metadata, not
    // a grant of credentials or permission to select the blocked adapter.
    const observedHeaders: Headers[] = [];
    const acceptedCards: McpDiscoveryResult[] = [];
    const spoofedSessions: Array<string | undefined> = [];
    const spoofed = new McpProtocolLifecycle({
      adapter: new Mcp2026ProtocolAdapter(),
      clientInfo: { name: 'kicad-studio', version: '1.17.1' },
      sessionStore: {
        read: () => 'injected-2025-session',
        write: async (session) => {
          spoofedSessions.push(session);
        }
      },
      transport: new HttpJsonRpcTransport({
        fetchFn: async (_url, init) => {
          const headers = new Headers(init?.headers);
          observedHeaders.push(headers);
          const request = JSON.parse(String(init?.body)) as { method: string };
          const response =
            request.method === 'server/discover'
              ? {
                  resultType: 'complete',
                  supportedVersions: ['2026-07-28'],
                  capabilities: { unauthorizedAdminAccess: true },
                  ttlMs: 999_999,
                  cacheScope: 'public',
                  _meta: {
                    'io.modelcontextprotocol/serverInfo': {
                      name: 'untrusted-peer',
                      version: '99.0.0',
                      privileged: true,
                      permission: 'administrator'
                    }
                  }
                }
              : { resultType: 'complete', tools: [] };
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: observedHeaders.length,
              result: response
            }),
            {
              headers: {
                'Content-Type': 'application/json',
                'Mcp-Session-Id': 'spoofed-2025-session',
                'Set-Cookie': 'mcp-admin=spoofed',
                Authorization: 'Bearer spoofed'
              }
            }
          );
        },
        logger: { debug() {}, warn() {} },
        maxRetries: 1
      })
    });
    await spoofed.ensureReady(runtime, {
      onDiscovery: (card) => {
        if (card) acceptedCards.push(card);
      }
    });
    await spoofed.ensureReady(
      { ...runtime, hasDiscoveryState: true },
      {
        onDiscovery: (card) => {
          if (card) acceptedCards.push(card);
        }
      }
    );
    await spoofed.execute('tools/list', {}, runtime);
    assert.equal(
      acceptedCards.length,
      2,
      'untrusted public TTL must not bypass discovery'
    );
    assert.equal(acceptedCards[0]?.cacheScope, 'public');
    assert.deepEqual(spoofedSessions, []);
    assert.ok(
      observedHeaders.every(
        (headers) =>
          !headers.has('Authorization') &&
          !headers.has('Cookie') &&
          !headers.has('MCP-Session-Id') &&
          headers.get('MCP-Protocol-Version') === '2026-07-28'
      )
    );
    assert.equal(
      resolveMcpProtocolAdapter(MCP_PROTOCOL_VERSION).lifecycle,
      'stateless-discovery'
    );
  });
});

async function assertPublishedActive2026ExtensionHost(): Promise<void> {
  assert.equal(
    resolveMcpProtocolAdapter(MCP_PROTOCOL_VERSION).lifecycle,
    'stateless-discovery'
  );
  await withPublishedStatelessServer(async (modernEndpoint) => {
    await configureMcpEndpoint(`${modernEndpoint}/mcp`);
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(
      extension,
      'The installed Studio VS Code extension must activate'
    );
    await extension.activate();
    assert.equal(extension.isActive, true);
    await vscode.commands.executeCommand(COMMANDS.retryMcp);
    await vscode.commands.executeCommand(
      COMMANDS.qualityGateRunThis,
      placementGate()
    );

    const saved = new Map<string, unknown>();
    const context = {
      extension: { packageJSON: { version: '1.17.1' } },
      globalState: {
        get: <T>(key: string): T | undefined => saved.get(key) as T | undefined,
        update: async (key: string, value: unknown) => {
          saved.set(key, value);
        }
      }
    } as unknown as vscode.ExtensionContext;
    const detector = {
      detectKicadMcpPro: async () => ({ found: true, source: 'uvx' })
    } as unknown as ConstructorParameters<typeof McpClient>[1];
    const logger = new Logger('Production MCP 2026 Selection');
    try {
      // No adapter injection: this selects the same compiled protocol as Studio.
      const client = new McpClient(context, detector, logger, {
        maxRetries: 1
      });
      const state = await client.testConnection();
      assert.equal(state.kind, 'Connected', state.message);
      assert.equal(
        state.server?.version,
        process.env['REAL_SERVER_PYPI_VERSION']
      );
      const version = await client.callTool('kicad_get_version', {});
      assert.match(JSON.stringify(version), /KiCad MCP Pro Server v4\.3\.0/u);
      assert.equal(saved.has('kicadstudio.mcp.sessionId'), false);

      // A 2025 session remains a separate, explicit rollback path. The
      // production 2026 client never negotiates down on untrusted metadata.
      await withRealServer(async (legacy) => {
        await configureMcpEndpoint(legacy.endpoint);
        const rollback = new McpClient(context, detector, logger, {
          protocolAdapter: new Mcp2025ProtocolAdapter(),
          maxRetries: 1
        });
        const restored = await rollback.testConnection();
        assert.equal(restored.kind, 'Connected', restored.message);
        const legacyVersion = await rollback.callTool('kicad_get_version', {});
        assert.ok(legacyVersion);
        const rollbackTools = await legacy.listTools();
        for (const tool of REQUIRED_EXTENSION_HOST_TOOLS) {
          assert.ok(
            rollbackTools.includes(tool),
            `Missing 2025 rollback tool ${tool}`
          );
        }
        const rollbackGate = await rollback.callTool(
          'project_quality_gate_report',
          {}
        );
        assert.ok(rollbackGate, '2025 rollback quality gate must return data');
        const rollbackResource = await legacy.readResource(
          'kicad://project/quality_gate'
        );
        assert.match(rollbackResource, /Project quality gate:/u);
        const unsupported = new McpClient(
          {
            ...context,
            globalState: {
              get: <T>(key: string): T | undefined =>
                saved.get(key) as T | undefined,
              update: async (key: string, value: unknown) => {
                saved.set(key, value);
              }
            }
          } as unknown as vscode.ExtensionContext,
          detector,
          logger,
          { maxRetries: 1 }
        );
        const wrongLane = await unsupported.testConnection();
        assert.notEqual(
          wrongLane.kind,
          'Connected',
          'Do not auto-downgrade modern production'
        );
      });
    } finally {
      await configureMcpEndpoint(`${modernEndpoint}/mcp`);
      logger.dispose();
    }
  });
}

async function configureMcpEndpoint(endpoint: string): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const baseEndpoint = endpoint.replace(/\/mcp$/, '');
  await Promise.all([
    config.update(
      SETTINGS.mcpAutoDetect,
      false,
      vscode.ConfigurationTarget.Workspace
    ),
    config.update(
      SETTINGS.mcpEndpoint,
      baseEndpoint,
      vscode.ConfigurationTarget.Workspace
    ),
    config.update(
      SETTINGS.mcpProfile,
      'full',
      vscode.ConfigurationTarget.Workspace
    ),
    config.update(SETTINGS.mcpTimeout, 90, vscode.ConfigurationTarget.Workspace)
  ]);
}

function placementGate(): QualityGateResult {
  return {
    id: 'placement',
    label: 'Placement',
    status: 'PENDING',
    summary:
      'Run the placement quality gate through the extension command path.',
    details: [],
    violations: []
  };
}
