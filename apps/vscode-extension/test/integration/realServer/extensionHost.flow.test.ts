import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { COMMANDS, EXTENSION_ID, SETTINGS } from '../../../src/constants';
import { isMcpVersionSupported } from '../../../src/mcp/compat';
import type { QualityGateResult } from '../../../src/types';
import { withPublishedStatelessServer, withRealServer } from './setup';
import { Mcp2026ProtocolAdapter } from '../../../src/mcp/protocol/mcp2026ProtocolAdapter';
import {
  resolveMcpProtocolAdapter,
  UnsupportedMcpProtocolVersionError
} from '../../../src/mcp/protocol/protocolAdapterRegistry';
import { McpProtocolLifecycle } from '../../../src/mcp/protocol/protocolLifecycle';
import { HttpJsonRpcTransport } from '../../../src/mcp/transport/httpJsonRpcTransport';

const REQUIRED_EXTENSION_HOST_TOOLS = [
  'project_quality_gate_report',
  'pcb_placement_quality_gate',
  'pcb_transfer_quality_gate'
] as const;

suite('Real Pair Extension Host', () => {
  test('connects KiCad Studio commands to the real MCP server', async function () {
    this.timeout(180000);

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
          const runtime = {
            baseEndpoint: modernEndpoint,
            allowLegacySse: false,
            timeoutMs: 20_000,
            hasDiscoveryState: false
          };
          await modern.ensureReady(runtime, { onDiscovery() {} });
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
          assert.ok(outgoing.length >= 3);
          assert.ok(
            outgoing.every(
              (h) => h.get('MCP-Protocol-Version') === '2026-07-28'
            )
          );
          assert.ok(outgoing.every((h) => !h.has('MCP-Session-Id')));
          assert.equal(outgoing.at(-1)?.get('Mcp-Name'), 'kicad_get_version');
        });
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
});

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
