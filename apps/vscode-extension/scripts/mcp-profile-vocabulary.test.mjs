import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
);
const schema = JSON.parse(
  fs.readFileSync(path.join(root, 'schemas', 'vscode-mcp.kicad.json'), 'utf8')
);
const primary = ['review', 'build', 'release', 'expert'];

test('settings manifest uses the task-oriented profile vocabulary', () => {
  const setting =
    packageJson.contributes.configuration.properties['kicadstudio.mcp.profile'];
  assert.equal(setting.default, 'review');
  assert.deepEqual(setting.enum.slice(0, primary.length), primary);
});

test('workspace MCP schema accepts the task-oriented profile vocabulary', () => {
  const profile =
    schema.properties.servers.additionalProperties.properties.env.properties
      .KICAD_MCP_PROFILE;
  for (const id of primary)
    assert.ok(profile.enum.includes(id), `missing ${id}`);
});
