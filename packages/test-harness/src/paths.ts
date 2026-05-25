import fs from "node:fs";
import path from "node:path";

export interface RepoRootOptions {
  startDir?: string;
  markerFile?: string;
}

export function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/").split(path.sep).join("/");
}

export function isSubpath(childPath: string, parentPath: string): boolean {
  const relativePath = path.relative(
    path.resolve(parentPath),
    path.resolve(childPath),
  );
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export function findRepoRoot(options: RepoRootOptions = {}): string {
  const markerFile = options.markerFile ?? "pnpm-workspace.yaml";
  let current = path.resolve(options.startDir ?? process.cwd());

  while (true) {
    if (fs.existsSync(path.join(current, markerFile))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `Could not find repository root from ${current}; missing ${markerFile}`,
      );
    }
    current = parent;
  }
}

export function repoPath(...segments: string[]): string {
  return path.join(findRepoRoot(), ...segments);
}

export function relativePosixPath(from: string, to: string): string {
  return toPosixPath(path.relative(from, to));
}

export function normalizePathForSnapshot(
  candidatePath: string,
  repoRoot = findRepoRoot(),
): string {
  const resolved = path.resolve(candidatePath);
  if (isSubpath(resolved, repoRoot)) {
    return relativePosixPath(repoRoot, resolved);
  }
  return toPosixPath(resolved);
}

export function kicadFixtureRoot(repoRoot = findRepoRoot()): string {
  return path.join(
    repoRoot,
    "apps",
    "vscode-extension",
    "test",
    "fixtures",
    "kicad",
  );
}

export function kicadFixturePath(
  fixtureId: string,
  ...segments: string[]
): string {
  return path.join(kicadFixtureRoot(), fixtureId, ...segments);
}

export function kicadFixtureManifestPath(repoRoot = findRepoRoot()): string {
  return path.join(kicadFixtureRoot(repoRoot), "manifest.json");
}

export function benchmarkFixtureRoot(repoRoot = findRepoRoot()): string {
  return path.join(
    repoRoot,
    "apps",
    "vscode-extension",
    "test",
    "fixtures",
    "benchmark_projects",
  );
}
