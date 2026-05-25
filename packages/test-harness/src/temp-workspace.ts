import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CopyDirectoryOptions {
  filter?: (sourcePath: string, targetPath: string) => boolean;
}

export interface TempWorkspaceOptions extends CopyDirectoryOptions {
  prefix?: string;
  sourcePath?: string;
  keep?: boolean;
}

export interface TempWorkspace {
  path: string;
  sourcePath?: string;
  cleanup(): void;
}

export function copyDirectory(
  sourcePath: string,
  targetPath: string,
  options: CopyDirectoryOptions = {},
): void {
  const sourceStats = fs.statSync(sourcePath);
  if (!sourceStats.isDirectory()) {
    throw new Error(`Expected directory source, got ${sourcePath}`);
  }

  fs.mkdirSync(targetPath, { recursive: true });
  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    const sourceEntry = path.join(sourcePath, entry.name);
    const targetEntry = path.join(targetPath, entry.name);
    if (options.filter && !options.filter(sourceEntry, targetEntry)) {
      continue;
    }
    if (entry.isDirectory()) {
      copyDirectory(sourceEntry, targetEntry, options);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(sourceEntry);
      const type = symlinkTypeForCopy(sourceEntry);
      fs.symlinkSync(
        symlinkTargetForCopy(linkTarget, targetEntry, type),
        targetEntry,
        type,
      );
    } else if (entry.isFile()) {
      fs.copyFileSync(sourceEntry, targetEntry);
    }
  }
}

export function createTempWorkspace(
  options: TempWorkspaceOptions = {},
): TempWorkspace {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), options.prefix ?? "kicad-test-workspace-"),
  );

  if (options.sourcePath) {
    copyDirectory(options.sourcePath, root, options);
  }

  const workspace: TempWorkspace = {
    path: root,
    cleanup() {
      if (!options.keep) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  };
  if (options.sourcePath) {
    workspace.sourcePath = options.sourcePath;
  }
  return workspace;
}

type SymlinkType = "dir" | "file" | "junction";

function symlinkTypeForCopy(sourceEntry: string): SymlinkType {
  if (!fs.statSync(sourceEntry).isDirectory()) {
    return "file";
  }
  return process.platform === "win32" ? "junction" : "dir";
}

function symlinkTargetForCopy(
  linkTarget: string,
  targetEntry: string,
  type: SymlinkType,
): string {
  if (type === "junction" && !path.isAbsolute(linkTarget)) {
    return path.resolve(path.dirname(targetEntry), linkTarget);
  }
  return linkTarget;
}
