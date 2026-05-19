import * as assert from 'node:assert/strict';
import { withRealServer } from './setup';

async function run(): Promise<void> {
  await withRealServer(async (server) => {
    assert.match(server.initializeResult.serverInfo?.version ?? '', /^3\./);
    const tools = await server.listTools();
    assert.ok(tools.includes('project_quality_gate_report'));
    console.log(`real-server quickstart passed against ${server.endpoint}`);
  });
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
