import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { URL } from 'node:url';

const extensionRoot = new URL('../', import.meta.url);
const repositoryRoot = new URL('../../../', import.meta.url);
const nls = JSON.parse(
  readFileSync(new URL('package.nls.json', extensionRoot), 'utf8')
);
const marketplaceReadme = readFileSync(
  new URL('README.md', extensionRoot),
  'utf8'
);
const gettingStarted = readFileSync(
  new URL('docs/getting-started.md', repositoryRoot),
  'utf8'
);

const TASK_NAMES = [
  'Review',
  'Validate',
  'Fabrication Release',
  'Automate',
  'Maintain'
];

const TASK_COMMAND_TITLES = [
  'KiCad Studio: Review Project',
  'KiCad Studio: Validate Project',
  'KiCad Studio: Fabrication Release',
  'KiCad Studio: Automate Project',
  'KiCad Studio: Maintain Workspace'
];

test('uses the shared task vocabulary in the getting-started walkthrough', () => {
  const walkthroughText = Object.entries(nls)
    .filter(([key]) => key.startsWith('kicadstudio.contributes.walkthroughs.0'))
    .map(([, value]) => value)
    .join('\n');
  for (const task of TASK_NAMES) {
    assert.match(walkthroughText, new RegExp(task));
  }
});

test('documents every task entry point in the Marketplace README', () => {
  assert.match(marketplaceReadme, /^## Task-Oriented Workflows$/m);
  for (const title of TASK_COMMAND_TITLES) {
    assert.ok(
      marketplaceReadme.includes(`**${title}**`),
      `${title} is missing`
    );
  }
});

test('provides a first-ten-minute path with the same task vocabulary', () => {
  assert.match(
    gettingStarted,
    /^## First 10 Minutes: Task-Oriented Workflow$/m
  );
  for (const task of TASK_NAMES) {
    assert.match(gettingStarted, new RegExp(`\\*\\*${task}\\*\\*`));
  }
});
