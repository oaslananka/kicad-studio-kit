import * as assert from 'node:assert/strict';
import { withRealServer } from './setup';

async function run(): Promise<void> {
  await withRealServer(async (server) => {
    const result = await server.callTool('project_quality_gate_report', {});
    assert.ok(result);
    assert.ok(
      Object.keys(result).length > 0,
      'Expected project_quality_gate_report to return a payload.'
    );
    console.log('real-server quality gate passed');
  });
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
