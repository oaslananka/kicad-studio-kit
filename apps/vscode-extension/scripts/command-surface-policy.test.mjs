import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { URL } from 'node:url';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const policy = JSON.parse(
  readFileSync(new URL('./command-surface.json', import.meta.url), 'utf8')
);
const packageNls = JSON.parse(
  readFileSync(new URL('../package.nls.json', import.meta.url), 'utf8')
);

const TASKS = new Set([
  'review',
  'validate',
  'release',
  'automate',
  'maintain'
]);
const SURFACES = new Set(['top-level', 'contextual', 'hub', 'internal']);
const TOP_LEVEL_COMMANDS = new Set([
  'kicadstudio.tasks.open',
  'kicadstudio.tasks.review',
  'kicadstudio.tasks.validate',
  'kicadstudio.tasks.release',
  'kicadstudio.tasks.automate',
  'kicadstudio.tasks.maintain'
]);
const EMPTY_WORKSPACE_COMMANDS = new Set([
  'kicadstudio.tasks.open',
  'kicadstudio.tasks.maintain'
]);

function paletteMap() {
  return new Map(
    (packageJson.contributes?.menus?.commandPalette ?? []).map((item) => [
      item.command,
      item.when ?? 'ALWAYS'
    ])
  );
}

test('classifies every contributed command exactly once', () => {
  const contributed = new Set(
    (packageJson.contributes?.commands ?? []).map((entry) => entry.command)
  );
  const classified = new Set(Object.keys(policy.commands ?? {}));
  assert.deepEqual([...classified].sort(), [...contributed].sort());
});

test('uses only the supported task owners and discovery surfaces', () => {
  assert.equal(policy.schemaVersion, 1);
  for (const [command, record] of Object.entries(policy.commands ?? {})) {
    assert.ok(
      TASKS.has(record.task),
      `${command} has invalid task ${record.task}`
    );
    assert.ok(
      SURFACES.has(record.surface),
      `${command} has invalid surface ${record.surface}`
    );
  }
});

test('keeps the six task entry points as the only top-level commands', () => {
  const topLevel = new Set(
    Object.entries(policy.commands ?? {})
      .filter(([, record]) => record.surface === 'top-level')
      .map(([command]) => command)
  );
  assert.deepEqual([...topLevel].sort(), [...TOP_LEVEL_COMMANDS].sort());
});

test('hides hub and internal commands from direct Command Palette discovery', () => {
  const palette = paletteMap();
  for (const [command, record] of Object.entries(policy.commands ?? {})) {
    if (record.surface === 'hub' || record.surface === 'internal') {
      assert.equal(
        palette.get(command),
        'false',
        `${command} must use when:false in commandPalette`
      );
    }
  }
});

test('limits empty-workspace palette entries to the main hub and maintenance', () => {
  const unconditional = new Set(
    [...paletteMap().entries()]
      .filter(([, when]) => when === 'ALWAYS')
      .map(([command]) => command)
  );
  assert.deepEqual(
    [...unconditional].sort(),
    [...EMPTY_WORKSPACE_COMMANDS].sort()
  );
});

test('routes disconnected MCP onboarding through the Automate task hub', () => {
  for (const index of [8, 11, 14]) {
    const disconnectedWelcome =
      packageNls[`kicadstudio.contributes.viewsWelcome.${index}.contents`];
    assert.match(
      disconnectedWelcome,
      /command:kicadstudio\.tasks\.automate/,
      `MCP-dependent welcome ${index} must use the canonical Automate task entry point`
    );
    assert.doesNotMatch(
      disconnectedWelcome,
      /command:kicadstudio\.(?:setupMcpIntegration|mcp\.(?:install|retry|launchHttp|pickProfile))/,
      `MCP-dependent welcome ${index} must not compete with Task Hub onboarding`
    );
  }
});

test('keeps advanced sidebar surfaces progressively disclosed', () => {
  const sidebarViews = new Map(
    (packageJson.contributes?.views?.['kicadstudio-sidebar'] ?? []).map(
      (view) => [view.id, view]
    )
  );
  for (const id of [
    'kicadstudio.bomView',
    'kicadstudio.netlistView',
    'kicadstudio.variants',
    'kicadstudio.library',
    'kicadstudio.drcRules',
    'kicadstudio.fixQueue',
    'kicadstudio.componentSearch',
    'kicadstudio.mcpTools'
  ]) {
    assert.equal(
      sidebarViews.get(id)?.visibility,
      'collapsed',
      `${id} must default to collapsed progressive disclosure`
    );
  }
});
