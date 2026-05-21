import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { isMcpVersionSupported } from '../../../src/mcp/compat';
import { withRealServer } from './setup';

const REQUIRED_REAL_PAIR_TOOLS = [
  'project_quality_gate_report',
  'run_drc',
  'run_erc',
  'export_bom',
  'export_netlist',
  'studio_push_context'
] as const;

async function run(): Promise<void> {
  await withRealServer(async (server) => {
    const version = server.initializeResult.serverInfo?.version;
    assert.ok(
      isMcpVersionSupported(version),
      `Expected compatible server-info version, got ${version ?? 'unknown'}`
    );
    assert.ok(
      server.initializeResult.capabilities,
      'Expected initialize response to include MCP capabilities.'
    );

    const tools = await server.listTools();
    for (const tool of REQUIRED_REAL_PAIR_TOOLS) {
      assert.ok(tools.includes(tool), `Missing real-pair MCP tool ${tool}`);
    }

    const activeFile = path.join(server.projectDir, 'demo.kicad_pcb');
    const pushResult = await server.callTool('studio_push_context', {
      active_file: activeFile,
      file_type: 'pcb',
      drc_errors: [],
      selected_net: 'GND',
      selected_reference: 'U1',
      cursor_position: { line: 1, character: 0 }
    });
    assert.ok(pushResult !== undefined);

    const studioContext = await server.readResource('kicad://studio/context');
    assert.match(studioContext, /"file_type": "pcb"/);
    assert.match(studioContext, /"selected_net": "GND"/);

    const boardSummary = await server.readResource('kicad://board/summary');
    assert.match(
      boardSummary,
      /Board summary|KiCad is not connected/,
      'Expected live board summary or a degraded no-KiCad state.'
    );

    console.log(
      `real-pair compatibility passed with local server command: ${server.serverCommand}`
    );
  });
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
