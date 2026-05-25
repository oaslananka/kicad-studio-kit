import path from "node:path";

import { findRepoRoot } from "./paths";
import {
  type TempWorkspace,
  type TempWorkspaceOptions,
  createTempWorkspace,
} from "./temp-workspace";

export interface ExtensionDevelopmentPathOptions {
  repoRoot?: string;
}

export interface VsCodeLaunchArgsOptions extends ExtensionDevelopmentPathOptions {
  workspacePath?: string;
  extensionTestsPath?: string;
  extraArgs?: readonly string[];
}

export interface ExtensionWorkspaceOptions extends TempWorkspaceOptions {
  fixturePath?: string;
}

export function extensionDevelopmentPath(
  options: ExtensionDevelopmentPathOptions = {},
): string {
  return path.join(
    options.repoRoot ?? findRepoRoot(),
    "apps",
    "vscode-extension",
  );
}

export function extensionTestsPath(
  options: ExtensionDevelopmentPathOptions = {},
): string {
  return path.join(extensionDevelopmentPath(options), "out", "test");
}

export function createVsCodeExtensionLaunchArgs(
  options: VsCodeLaunchArgsOptions = {},
): string[] {
  const args = [
    "--extensionDevelopmentPath",
    extensionDevelopmentPath(options),
  ];
  if (options.extensionTestsPath) {
    args.push("--extensionTestsPath", options.extensionTestsPath);
  }
  if (options.workspacePath) {
    args.push(options.workspacePath);
  }
  if (options.extraArgs) {
    args.push(...options.extraArgs);
  }
  return args;
}

export function createExtensionTestWorkspace(
  options: ExtensionWorkspaceOptions = {},
): TempWorkspace {
  const sourcePath = options.fixturePath ?? options.sourcePath;
  const workspaceOptions: TempWorkspaceOptions = { ...options };
  delete (workspaceOptions as ExtensionWorkspaceOptions).fixturePath;
  if (sourcePath) {
    workspaceOptions.sourcePath = sourcePath;
  }
  return createTempWorkspace({
    ...workspaceOptions,
  });
}
