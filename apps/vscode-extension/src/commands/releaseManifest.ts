import { execFileSync } from 'node:child_process';

// Pure builders for the Fabrication Release Wizard (#400). Keeping the manifest,
// summary, and git-metadata logic free of vscode/fs side effects makes the
// release evidence deterministic and unit-testable.

export interface ReleaseManifestFileEntry {
  path: string;
  size: number;
  sha256: string;
}

export interface ReleaseGateSummary {
  label: string;
  status: string;
  summary: string;
}

export interface GitMetadata {
  commit?: string;
  shortCommit?: string;
  branch?: string;
  tag?: string;
  dirty?: boolean;
}

export interface KiCadSnapshot {
  version?: string | undefined;
  capabilities?: string[] | undefined;
}

export interface ReleaseManifest {
  schema: 'kicad-studio-release/1';
  generatedBy: string;
  extensionVersion: string;
  timestamp: string;
  variant?: string;
  git?: GitMetadata;
  kicad?: KiCadSnapshot;
  mcpServerVersion?: string;
  projectFile?: string;
  boardFile?: string;
  schematicFile?: string;
  qualityGates: ReleaseGateSummary[];
  files: ReleaseManifestFileEntry[];
}

export interface BuildReleaseManifestInput {
  extensionVersion: string;
  timestamp: string;
  variant?: string | undefined;
  git?: GitMetadata | undefined;
  kicad?: KiCadSnapshot | undefined;
  mcpServerVersion?: string | undefined;
  projectFile?: string | undefined;
  boardFile?: string | undefined;
  schematicFile?: string | undefined;
  qualityGates: ReleaseGateSummary[];
  files: ReleaseManifestFileEntry[];
}

export function buildReleaseManifest(
  input: BuildReleaseManifestInput
): ReleaseManifest {
  return {
    schema: 'kicad-studio-release/1',
    generatedBy: 'KiCad Studio Kit',
    extensionVersion: input.extensionVersion,
    timestamp: input.timestamp,
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.git ? { git: input.git } : {}),
    ...(input.kicad ? { kicad: input.kicad } : {}),
    ...(input.mcpServerVersion
      ? { mcpServerVersion: input.mcpServerVersion }
      : {}),
    ...(input.projectFile ? { projectFile: input.projectFile } : {}),
    ...(input.boardFile ? { boardFile: input.boardFile } : {}),
    ...(input.schematicFile ? { schematicFile: input.schematicFile } : {}),
    qualityGates: input.qualityGates,
    files: input.files
  };
}

/** Render a human-readable Markdown summary of a release manifest. */
export function renderReleaseSummary(manifest: ReleaseManifest): string {
  const lines: string[] = [];
  lines.push('# Manufacturing Release Summary', '');
  lines.push(`- Generated: ${manifest.timestamp}`);
  lines.push(`- KiCad Studio Kit: ${manifest.extensionVersion}`);
  if (manifest.variant) {
    lines.push(`- Variant: ${manifest.variant}`);
  }
  if (manifest.kicad?.version) {
    lines.push(`- KiCad CLI: ${manifest.kicad.version}`);
  }
  if (manifest.mcpServerVersion) {
    lines.push(`- MCP server: ${manifest.mcpServerVersion}`);
  }
  if (manifest.git?.shortCommit) {
    const dirty = manifest.git.dirty ? ' (uncommitted changes)' : '';
    const branch = manifest.git.branch ? ` on ${manifest.git.branch}` : '';
    const tag = manifest.git.tag ? ` [${manifest.git.tag}]` : '';
    lines.push(`- Source: ${manifest.git.shortCommit}${branch}${tag}${dirty}`);
  }

  lines.push('', '## Quality Gates', '');
  if (manifest.qualityGates.length === 0) {
    lines.push('No quality gate results were recorded.');
  } else {
    lines.push('| Gate | Status | Summary |', '| --- | --- | --- |');
    for (const gate of manifest.qualityGates) {
      lines.push(
        `| ${escapeCell(gate.label)} | ${escapeCell(gate.status)} | ${escapeCell(gate.summary)} |`
      );
    }
  }

  lines.push('', `## Artifacts (${manifest.files.length})`, '');
  if (manifest.files.length === 0) {
    lines.push('No artifacts were generated.');
  } else {
    lines.push('| File | Size (bytes) | SHA-256 |', '| --- | ---: | --- |');
    for (const file of manifest.files) {
      lines.push(
        `| ${escapeCell(file.path)} | ${file.size} | ${file.sha256} |`
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}

function escapeCell(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

export type GitRunner = (args: string[]) => string;

function defaultGitRunner(root: string): GitRunner {
  return (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
}

/**
 * Best-effort git metadata for the release manifest. Returns undefined when the
 * workspace is not a git repository (or git is unavailable); never throws.
 */
export function collectGitMetadata(
  root: string,
  runner?: GitRunner
): GitMetadata | undefined {
  const run = runner ?? defaultGitRunner(root);
  let commit: string;
  try {
    commit = run(['rev-parse', 'HEAD']);
  } catch {
    return undefined;
  }
  if (!commit) {
    return undefined;
  }

  const metadata: GitMetadata = {
    commit,
    shortCommit: commit.slice(0, 12)
  };
  try {
    const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch && branch !== 'HEAD') {
      metadata.branch = branch;
    }
  } catch {
    // branch is optional
  }
  try {
    const tag = run(['describe', '--tags', '--exact-match']);
    if (tag) {
      metadata.tag = tag;
    }
  } catch {
    // no exact tag on HEAD
  }
  try {
    const status = run(['status', '--porcelain']);
    metadata.dirty = status.length > 0;
  } catch {
    // dirty flag is optional
  }
  return metadata;
}
