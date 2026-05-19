import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { withRealServer } from './setup';

async function run(): Promise<void> {
  await withRealServer(async (server) => {
    const tools = await server.listTools();
    assert.ok(tools.includes('studio_push_context'));
    const result = await server.callTool('studio_push_context', {
      activeFile: path.join(server.projectDir, 'demo.kicad_pcb'),
      fileType: 'pcb',
      drcErrors: [],
      visibleLayers: ['F.Cu'],
      activeVariant: undefined
    });
    assert.ok(result !== undefined);
    console.log('real-server context bridge passed');
  });
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
