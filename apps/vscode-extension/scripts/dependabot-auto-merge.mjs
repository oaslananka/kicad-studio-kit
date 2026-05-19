#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const payload = JSON.parse(
    fs.readFileSync(requiredEnv('GITHUB_EVENT_PATH'), 'utf8')
  );
  const pr = payload.pull_request;
  if (!pr || payload.sender?.login !== 'dependabot[bot]') {
    console.log('No Dependabot pull request found.');
    return;
  }

  const repo = requiredEnv('GITHUB_REPOSITORY');
  const token = requiredEnv('GITHUB_TOKEN');
  const updateType = detectUpdateType(`${pr.title}\n${pr.body ?? ''}`);

  if (updateType === 'major') {
    await githubJson(`/repos/${repo}/issues/${pr.number}/labels`, token, {
      method: 'POST',
      body: JSON.stringify({ labels: ['needs-review'] })
    });
    console.log('Major dependency update labelled for review.');
    return;
  }

  if (updateType !== 'patch' && updateType !== 'minor') {
    console.log('Update type could not be classified for auto-merge.');
    return;
  }

  if (updateType === 'patch') {
    await githubJson(`/repos/${repo}/pulls/${pr.number}/reviews`, token, {
      method: 'POST',
      body: JSON.stringify({
        event: 'APPROVE',
        body: 'Auto-approved patch-level dependency update.'
      })
    });
  }

  const merge = spawnSync(
    'gh',
    ['pr', 'merge', String(pr.number), '--squash', '--auto', '--delete-branch'],
    {
      env: { ...process.env, GH_TOKEN: token },
      stdio: 'inherit',
      shell: process.platform === 'win32'
    }
  );
  if (merge.error) {
    console.error(merge.error.message);
    process.exit(1);
  }
  if (merge.status !== 0) {
    process.exit(merge.status ?? 1);
  }
}

function detectUpdateType(text) {
  const metadataMatch = text.match(
    /\bversion-update:semver-(major|minor|patch)\b/i
  );
  if (metadataMatch) {
    return metadataMatch[1].toLowerCase();
  }

  const match = text.match(
    /\bfrom\s+v?(\d+\.\d+\.\d+)\s+to\s+v?(\d+\.\d+\.\d+)/i
  );
  if (!match) {
    return 'unknown';
  }
  const from = match[1].split('.').map(Number);
  const to = match[2].split('.').map(Number);
  if (to[0] > from[0]) {
    return 'major';
  }
  if (to[1] > from[1]) {
    return 'minor';
  }
  if (to[2] > from[2]) {
    return 'patch';
  }
  return 'unknown';
}

async function githubJson(pathname, token, init = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'kicad-studio-dependency-automation',
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub API ${pathname} failed with ${response.status}: ${text}`
    );
  }
  return response;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
