#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
);
const vsixName = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(root, vsixName);

if (!fs.existsSync(vsixPath)) {
  throw new Error(`Missing VSIX artifact: ${vsixName}`);
}

const digest = crypto
  .createHash('sha256')
  .update(fs.readFileSync(vsixPath))
  .digest('hex');
fs.writeFileSync(
  path.join(root, 'SHA256SUMS.txt'),
  `${digest}  ${vsixName}\n`,
  'utf8'
);

const pnpmArgs = [
  '--silent',
  'sbom',
  '--sbom-format',
  'cyclonedx',
  '--sbom-type',
  'application'
];
const pnpmInvocation =
  process.platform === 'win32'
    ? {
        command: process.env.ComSpec ?? 'cmd.exe',
        args: ['/d', '/s', '/c', 'pnpm', ...pnpmArgs]
      }
    : { command: 'pnpm', args: pnpmArgs };
const sbom = spawnSync(pnpmInvocation.command, pnpmInvocation.args, {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'inherit']
});

if (sbom.error) {
  console.error(sbom.error.message);
  process.exit(1);
}

if (sbom.status !== 0) {
  process.exit(sbom.status ?? 1);
}

const parsedSbom = parseJsonOutput(sbom.stdout);

fs.writeFileSync(
  path.join(root, 'sbom.cdx.json'),
  `${JSON.stringify(parsedSbom, null, 2)}\n`,
  'utf8'
);

const provenance = buildProvenance({ vsixName, digest, pkg });
fs.writeFileSync(
  path.join(root, 'provenance.json'),
  `${JSON.stringify(provenance, null, 2)}\n`,
  'utf8'
);

fs.writeFileSync(
  path.join(root, 'release-summary.md'),
  renderReleaseSummary(provenance),
  'utf8'
);

function env(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}

function resolveSourceCommit() {
  const fromCi = env('GITHUB_SHA');
  if (fromCi) {
    return fromCi;
  }
  const git = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  });
  if (git.status === 0 && typeof git.stdout === 'string') {
    const head = git.stdout.trim();
    if (head) {
      return head;
    }
  }
  return 'unknown';
}

function resolveReleaseTag() {
  return env('RELEASE_TAG') || env('GITHUB_REF_NAME') || 'unreleased';
}

function resolveBuildEnvironment() {
  const os = env('RUNNER_OS') || process.platform;
  const arch = env('RUNNER_ARCH') || process.arch;
  return `${os}/${arch}`;
}

function buildProvenance({ vsixName, digest, pkg }) {
  const extensionId = `${pkg.publisher}.${pkg.name}`;
  return {
    name: pkg.name,
    extensionId,
    version: pkg.version,
    artifact: vsixName,
    sha256: digest,
    sourceCommit: resolveSourceCommit(),
    releaseTag: resolveReleaseTag(),
    buildEnvironment: resolveBuildEnvironment(),
    ci: {
      repository: env('GITHUB_REPOSITORY') || 'oaslananka/kicad-studio-kit',
      workflow: env('GITHUB_WORKFLOW') || 'local',
      runId: env('GITHUB_RUN_ID') || 'local',
      runAttempt: env('GITHUB_RUN_ATTEMPT') || 'local'
    },
    artifacts: ['provenance.json', vsixName, 'SHA256SUMS.txt', 'sbom.cdx.json'],
    distribution: {
      marketplace: `https://marketplace.visualstudio.com/items?itemName=${extensionId}`,
      openVsx: `https://open-vsx.org/extension/${pkg.publisher}/${pkg.name}`,
      githubRelease: `https://github.com/${
        env('GITHUB_REPOSITORY') || 'oaslananka/kicad-studio-kit'
      }/releases/tag/${resolveReleaseTag()}`
    }
  };
}

function renderReleaseSummary(p) {
  return [
    `# Release summary: ${p.extensionId} ${p.version}`,
    '',
    `- **Artifact:** \`${p.artifact}\``,
    `- **SHA-256:** \`${p.sha256}\``,
    `- **Source commit:** \`${p.sourceCommit}\``,
    `- **Release tag:** \`${p.releaseTag}\``,
    `- **Build environment:** \`${p.buildEnvironment}\``,
    `- **CI run:** \`${p.ci.workflow}\` run \`${p.ci.runId}\` (attempt \`${p.ci.runAttempt}\`)`,
    '',
    '## Verifiable artifacts',
    '',
    '- `provenance.json` — source commit, tag, version, build environment, and CI run identifiers.',
    `- \`${p.artifact}\` — packaged VS Code extension.`,
    '- `SHA256SUMS.txt` — SHA-256 checksums for the packaged extension.',
    '- `sbom.cdx.json` — CycloneDX software bill of materials.',
    '',
    '## Distribution locations',
    '',
    `- Visual Studio Marketplace: ${p.distribution.marketplace}`,
    `- Open VSX: ${p.distribution.openVsx}`,
    `- GitHub Release: ${p.distribution.githubRelease}`,
    ''
  ].join('\n');
}

function parseJsonOutput(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error('pnpm sbom returned empty output.');
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const parsed = parseJsonDocumentFromNoisyOutput(output);
    if (parsed) {
      return parsed;
    }
    throw new Error(
      `pnpm sbom did not return valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}

function parseJsonDocumentFromNoisyOutput(output) {
  const lines = output.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const column = lines[index].indexOf('{');
    if (column === -1) {
      continue;
    }

    const candidate = [lines[index].slice(column), ...lines.slice(index + 1)]
      .join('\n')
      .trim();
    const end = candidate.lastIndexOf('}');
    if (end === -1) {
      continue;
    }

    try {
      return JSON.parse(candidate.slice(0, end + 1));
    } catch {
      continue;
    }
  }
  return null;
}
