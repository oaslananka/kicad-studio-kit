import * as assert from 'node:assert/strict';
import { isMcpVersionSupported } from '../../../src/mcp/compat';
import { withRealServer } from './setup';

async function run(): Promise<void> {
  await withRealServer(async (server) => {
    const version = server.initializeResult.serverInfo?.version;
    assert.ok(
      isMcpVersionSupported(version),
      `Expected local kicad-mcp-pro ${version ?? 'unknown'} to satisfy the extension compatibility matrix.`
    );
    const tools = await server.listTools();
    assert.ok(tools.includes('project_quality_gate_report'));
    console.log(`real-server quickstart passed against ${server.endpoint}`);
  });
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
