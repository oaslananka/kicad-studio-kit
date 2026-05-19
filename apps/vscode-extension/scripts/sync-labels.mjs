#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABELS_FILE = path.join(ROOT, '.github', 'labels.yml');

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const repo = requiredEnv('GITHUB_REPOSITORY');
  const token = requiredEnv('GITHUB_TOKEN');
  const desired = parseLabels(fs.readFileSync(LABELS_FILE, 'utf8'));
  const desiredNames = new Set(desired.map((label) => label.name));

  for (const label of desired) {
    const payload = {
      color: label.color,
      description: label.description ?? ''
    };
    const updated = await githubJson(
      `/repos/${repo}/labels/${encodeURIComponent(label.name)}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );

    if (updated.status === 404) {
      const created = await githubJson(`/repos/${repo}/labels`, token, {
        method: 'POST',
        body: JSON.stringify({ name: label.name, ...payload })
      });
      if (!created.ok) {
        throw apiError(`create label ${label.name}`, created);
      }
    } else if (!updated.ok) {
      throw apiError(`update label ${label.name}`, updated);
    }
  }

  for (const label of await listLabels(repo, token)) {
    if (!desiredNames.has(label.name)) {
      const deleted = await githubJson(
        `/repos/${repo}/labels/${encodeURIComponent(label.name)}`,
        token,
        { method: 'DELETE' }
      );
      if (!deleted.ok && deleted.status !== 404) {
        throw apiError(`delete label ${label.name}`, deleted);
      }
    }
  }
}

function parseLabels(text) {
  const labels = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const itemField = line.match(/^-\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (itemField) {
      if (current) {
        labels.push(normalizeLabel(current));
      }
      current = { [itemField[1]]: parseScalar(itemField[2]) };
      continue;
    }

    const field = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.+)$/);
    if (field && current) {
      current[field[1]] = parseScalar(field[2]);
    }
  }

  if (current) {
    labels.push(normalizeLabel(current));
  }

  if (labels.length === 0) {
    throw new Error(`${LABELS_FILE} does not define any labels.`);
  }
  return labels;
}

function normalizeLabel(label) {
  if (!label.name) {
    throw new Error('Label entry is missing a name.');
  }
  const color = String(label.color ?? '').replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(color)) {
    throw new Error(`Label "${label.name}" has an invalid color: ${color}`);
  }
  return {
    name: String(label.name),
    color,
    description: label.description ? String(label.description) : ''
  };
}

function parseScalar(value) {
  const trimmed = stripInlineComment(value).trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function stripInlineComment(value) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    if (
      char === '#' &&
      !inSingleQuote &&
      !inDoubleQuote &&
      /\s/.test(value[index - 1])
    ) {
      break;
    }
    result += char;
  }
  return result;
}

async function listLabels(repo, token) {
  const labels = [];
  for (let page = 1; ; page += 1) {
    const result = await githubJson(
      `/repos/${repo}/labels?per_page=100&page=${page}`,
      token
    );
    if (!result.ok) {
      throw apiError('list labels', result);
    }
    labels.push(...result.data);
    if (result.data.length < 100) {
      return labels;
    }
  }
}

async function githubJson(pathname, token, init = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'kicad-studio-label-sync',
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    data: text ? parseJson(text) : null
  };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function apiError(action, result) {
  const message =
    result.data &&
    typeof result.data === 'object' &&
    typeof result.data.message === 'string'
      ? result.data.message
      : 'GitHub API returned an unexpected response.';
  return new Error(`Failed to ${action}: ${result.status} ${message}`);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
