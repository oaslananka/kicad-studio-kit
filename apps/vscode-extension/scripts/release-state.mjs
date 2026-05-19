#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPO = 'oaslananka/kicad-studio';
const PERSONAL_REPO = 'oaslananka/kicad-studio';
const STATES = [
  'no-release',
  'release-pr-open',
  'release-pr-green',
  'release-pr-merged',
  'tag-created',
  'dry-run-success',
  'vsix-built',
  'marketplace-dry-run-ok',
  'open-vsx-dry-run-ok',
  'vscode-marketplace-published',
  'open-vsx-published',
  'github-release-published',
  'personal-mirror-synced',
  'post-release-smoke-success',
  'complete',
  'blocked'
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const repo = options.repo ?? DEFAULT_REPO;
  const packageJson = readJson(path.join(ROOT, 'package.json'));
  const version = packageJson.version;
  const tagName = readReleaseTagName(version);
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const state = await inspectReleaseState({ repo, tagName, token });

  if (options.summaryFile) {
    fs.writeFileSync(
      options.summaryFile,
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8'
    );
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatMarkdown(state));
  }

  if (options.json) {
    console.log(JSON.stringify(state, null, 2));
  } else {
    console.log(formatText(state));
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--repo':
        options.repo = requireValue(args, (index += 1), arg);
        break;
      case '--json':
        options.json = true;
        break;
      case '--summary-file':
        options.summaryFile = requireValue(args, (index += 1), arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/release-state.mjs [options]

Options:
  --repo owner/name      Canonical repository, default ${DEFAULT_REPO}.
  --json                Print machine-readable JSON.
  --summary-file path   Write JSON summary to the given path.
  --help                Show this help.

Environment:
  GH_TOKEN or GITHUB_TOKEN is optional for public repositories and recommended
  for release, workflow, and mirror state inspection.`);
}

async function inspectReleaseState({ repo, tagName, token }) {
  const [owner, name] = parseRepo(repo);
  const packageJson = readJson(path.join(ROOT, 'package.json'));
  const localVsix = path.join(
    ROOT,
    `${packageJson.name}-${packageJson.version}.vsix`
  );
  const checks = {
    pnpmLockExists: fs.existsSync(path.join(ROOT, 'pnpm-lock.yaml')),
    packageLockAbsent: !fs.existsSync(path.join(ROOT, 'package-lock.json')),
    localVsixExists: fs.existsSync(localVsix),
    localChecksumsExist: fs.existsSync(path.join(ROOT, 'SHA256SUMS.txt')),
    localSbomExists: fs.existsSync(path.join(ROOT, 'sbom.cdx.json'))
  };

  const remote = token
    ? await inspectRemote({ owner, name, repo, tagName, token })
    : {
        tokenAvailable: false,
        tagExists: false,
        tagStatus: null,
        release: null,
        apiErrors: [],
        openReleasePr: null,
        latestReleaseRun: null,
        personalMirrorSynced: false,
        note: 'No GitHub token was available; remote state was not inspected.'
      };

  const blockers = collectBlockers({ checks, remote, tagName });
  const currentState =
    blockers.length > 0 ? 'blocked' : selectCurrentState({ checks, remote });
  const safeToPublish =
    blockers.length === 0 &&
    remote.latestReleaseRun?.conclusion === 'success' &&
    checks.localVsixExists;

  return {
    repo,
    personalRepo: PERSONAL_REPO,
    packageName: packageJson.name,
    version: packageJson.version,
    tagName,
    states: STATES,
    currentState,
    safe_to_publish: safeToPublish,
    blockers,
    nextSafeCommand: nextSafeCommand({
      currentState,
      tagName,
      blockers,
      remote
    }),
    checks,
    remote,
    generatedAt: new Date().toISOString()
  };
}

function parseRepo(repo) {
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('--repo must use owner/name format.');
  }
  return parts;
}

async function inspectRemote({ owner, name, repo, tagName, token }) {
  const [tag, release, pulls, runs, canonicalMain, personalMain] =
    await Promise.all([
      githubJson(
        `/repos/${repo}/git/ref/tags/${encodeURIComponent(tagName)}`,
        token
      ),
      githubJson(
        `/repos/${repo}/releases/tags/${encodeURIComponent(tagName)}`,
        token
      ),
      githubJson(`/repos/${repo}/pulls?state=open&per_page=50`, token),
      githubJson(
        `/repos/${repo}/actions/workflows/release.yml/runs?per_page=10`,
        token
      ),
      githubJson(`/repos/${owner}/${name}/commits/main`, token),
      githubJson(`/repos/${PERSONAL_REPO}/commits/main`, token)
    ]);

  const openReleasePr = Array.isArray(pulls.data)
    ? (pulls.data.find(
        (pull) =>
          pull.head?.ref?.startsWith('release-please--') ||
          /^(chore|release)(\(.+\))?: release\b/i.test(pull.title ?? '')
      ) ?? null)
    : null;
  const latestReleaseRun = Array.isArray(runs.data?.workflow_runs)
    ? (runs.data.workflow_runs[0] ?? null)
    : null;
  const apiErrors = [
    apiErrorFor('tag lookup', tag),
    apiErrorFor('release lookup', release),
    apiErrorFor('open pull requests lookup', pulls),
    apiErrorFor('release workflow runs lookup', runs),
    apiErrorFor('canonical main lookup', canonicalMain),
    apiErrorFor('personal mirror main lookup', personalMain)
  ].filter(Boolean);

  return {
    tokenAvailable: true,
    tagExists: tag.ok,
    tagStatus: tag.status,
    tagSha: tag.data?.object?.sha ?? null,
    release: release.ok
      ? {
          id: release.data.id,
          htmlUrl: release.data.html_url,
          draft: release.data.draft,
          prerelease: release.data.prerelease,
          assetNames: (release.data.assets ?? []).map((asset) => asset.name)
        }
      : null,
    apiErrors,
    openReleasePr: openReleasePr
      ? {
          number: openReleasePr.number,
          title: openReleasePr.title,
          draft: openReleasePr.draft,
          htmlUrl: openReleasePr.html_url
        }
      : null,
    latestReleaseRun: latestReleaseRun
      ? {
          id: latestReleaseRun.id,
          name: latestReleaseRun.name,
          status: latestReleaseRun.status,
          conclusion: latestReleaseRun.conclusion,
          event: latestReleaseRun.event,
          htmlUrl: latestReleaseRun.html_url,
          createdAt: latestReleaseRun.created_at
        }
      : null,
    personalMirrorSynced:
      canonicalMain.ok &&
      personalMain.ok &&
      canonicalMain.data.sha === personalMain.data.sha,
    canonicalMainSha: canonicalMain.data?.sha ?? null,
    personalMainSha: personalMain.data?.sha ?? null
  };
}

async function githubJson(pathname, token) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'kicad-studio-release-state'
    }
  });

  const data = await readResponseBody(response);
  return { ok: response.ok, status: response.status, data };
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    return { message: text.slice(0, 500) };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function apiErrorFor(label, result) {
  if (result.ok || result.status === 404) {
    return null;
  }
  const message =
    result.data &&
    typeof result.data === 'object' &&
    typeof result.data.message === 'string'
      ? `: ${result.data.message}`
      : '';
  return `${label} failed with HTTP ${result.status}${message}.`;
}

function collectBlockers({ checks, remote, tagName }) {
  const blockers = [];
  if (!checks.pnpmLockExists) {
    blockers.push('pnpm-lock.yaml is missing.');
  }
  if (!checks.packageLockAbsent) {
    blockers.push(
      'package-lock.json must not be committed after pnpm migration.'
    );
  }
  if (!remote.tokenAvailable) {
    blockers.push(
      'remote GitHub state was not inspected because no token was available.'
    );
  }
  for (const apiError of remote.apiErrors ?? []) {
    blockers.push(apiError);
  }
  if (remote.tokenAvailable && !remote.tagExists && remote.tagStatus === 404) {
    blockers.push(`release tag ${tagName} does not exist.`);
  }
  if (remote.release?.draft) {
    blockers.push('GitHub Release is still a draft.');
  }
  if (
    remote.latestReleaseRun &&
    remote.latestReleaseRun.conclusion !== 'success'
  ) {
    blockers.push('latest release workflow run is not successful.');
  }
  return blockers;
}

function selectCurrentState({ checks, remote }) {
  if (remote.personalMirrorSynced && remote.release && !remote.release.draft) {
    return 'personal-mirror-synced';
  }
  if (
    remote.release?.assetNames?.some((name) => name.endsWith('.vsix')) ||
    checks.localVsixExists
  ) {
    return 'vsix-built';
  }
  if (remote.release && !remote.release.draft) {
    return 'github-release-published';
  }
  if (remote.latestReleaseRun?.conclusion === 'success') {
    return 'dry-run-success';
  }
  if (remote.tagExists) {
    return 'tag-created';
  }
  if (remote.openReleasePr) {
    return remote.openReleasePr.draft ? 'release-pr-open' : 'release-pr-green';
  }
  return 'no-release';
}

function nextSafeCommand({ currentState, tagName, blockers, remote }) {
  if (blockers.length > 0) {
    return 'Resolve blockers, then re-run node scripts/release-state.mjs --json.';
  }
  if (currentState === 'no-release') {
    return 'Open or update the release PR through the configured release automation.';
  }
  if (currentState === 'tag-created') {
    return `Run the Release workflow diagnostics for ${tagName}.`;
  }
  if (currentState === 'vsix-built' && !remote.latestReleaseRun) {
    return `Run the Release workflow diagnostics for ${tagName}.`;
  }
  if (currentState === 'dry-run-success' || currentState === 'vsix-built') {
    return 'Review release artifacts and keep publish authority in the release workflow outputs.';
  }
  return 'Inspect post-release smoke and mirror state before closing the release.';
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readReleaseTagName(version) {
  const configFile = path.join(ROOT, 'release-please-config.json');
  const config = fs.existsSync(configFile) ? readJson(configFile) : {};
  const packageConfig = config.packages?.['.'] ?? {};
  const includeVInTag =
    readBoolean(packageConfig['include-v-in-tag']) ??
    readBoolean(packageConfig['include-v-in-tags']) ??
    readBoolean(config['include-v-in-tag']) ??
    readBoolean(config['include-v-in-tags']) ??
    true;
  const versionName = includeVInTag ? `v${version}` : version;
  const component =
    readString(packageConfig.component) ??
    readString(packageConfig['package-name']);

  return component ? `${component}-${versionName}` : versionName;
}

function readBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function readString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function formatText(state) {
  return [
    `Release state for ${state.repo}`,
    `Version: ${state.version}`,
    `Tag: ${state.tagName}`,
    `Current state: ${state.currentState}`,
    `safe_to_publish: ${state.safe_to_publish}`,
    `Next safe command: ${state.nextSafeCommand}`,
    `Blockers: ${state.blockers.length > 0 ? state.blockers.join('; ') : 'none'}`
  ].join('\n');
}

function formatMarkdown(state) {
  const blockers =
    state.blockers.length > 0
      ? state.blockers.map((blocker) => `- ${blocker}`).join('\n')
      : '- none';
  return `## Release State

- Repo: ${state.repo}
- Version: ${state.version}
- Tag: ${state.tagName}
- Current state: ${state.currentState}
- safe_to_publish: ${state.safe_to_publish}
- Next safe command: ${state.nextSafeCommand}

### Blockers

${blockers}
`;
}
