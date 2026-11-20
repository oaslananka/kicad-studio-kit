import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { withRealServer } from './setup';

async function run(): Promise<void> {
  await withRealServer(async (server) => {
    const result = await server.callTool('project_quality_gate_report', {});
    assert.ok(result);
    const cli = spawnSync(
      process.env['KICAD_MCP_KICAD_CLI'] || 'kicad-cli',
      ['version'],
      { encoding: 'utf8' }
    );
    if (cli.error || cli.status !== 0) {
      assert.equal(
        result['isError'],
        true,
        'Without KiCad CLI, the real-server quality gate must fail closed.'
      );
      console.log(
        'real-server quality gate NOT VERIFIED: kicad-cli unavailable; MCP tool error correctly surfaced'
      );
      return;
    }
    assert.equal(
      result['isError'],
      false,
      'A tool-level error must not count as a successful real-server quality gate.'
    );
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
