import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { COMMANDS, EXTENSION_ID, SETTINGS } from '../../../src/constants';
import { isMcpVersionSupported } from '../../../src/mcp/compat';
import type { QualityGateResult } from '../../../src/types';
import { withRealServer } from './setup';

const REQUIRED_EXTENSION_HOST_TOOLS = [
  'project_quality_gate_report',
  'pcb_placement_quality_gate',
  'pcb_transfer_quality_gate',
  'manufacturing_quality_gate'
] as const;

suite('Real Pair Extension Host', () => {
  test('connects KiCad Studio commands to the local MCP server', async function () {
    this.timeout(180000);

    await withRealServer(async (server) => {
      await configureMcpEndpoint(server.endpoint);

      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(
        extension,
        `Expected extension ${EXTENSION_ID} to be installed.`
      );
      await extension.activate();
      assert.strictEqual(extension.isActive, true);

      await vscode.commands.executeCommand(COMMANDS.retryMcp);

      const tools = await server.listTools();
      for (const tool of REQUIRED_EXTENSION_HOST_TOOLS) {
        assert.ok(tools.includes(tool), `Missing real-pair tool ${tool}`);
      }

      await vscode.commands.executeCommand(
        COMMANDS.qualityGateRunThis,
        placementGate()
      );

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
