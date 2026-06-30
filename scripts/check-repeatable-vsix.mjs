#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  compareVsixContent,
} = require("../apps/vscode-extension/scripts/validate-vsix-metadata.js");

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const extensionRoot = path.join(repoRoot, "apps", "vscode-extension");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? "inherit",
    shell: false,
    env: {
      ...process.env,
      CI: "1",
      SOURCE_DATE_EPOCH: "0",
      ...options.env,
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}`,
    );
  }
}

function packageOnce(targetPath) {
  run("corepack", ["pnpm", "--filter", "kicadstudiokit", "run", "package"]);
  const pkg = JSON.parse(
    fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"),
  );
  const vsixPath = path.join(extensionRoot, `${pkg.name}-${pkg.version}.vsix`);
  fs.copyFileSync(vsixPath, targetPath);
  return vsixPath;
}

export function checkRepeatableVsix(options = {}) {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "kicad-vsix-repeatable-"),
  );
  const first = path.join(workspace, "first.vsix");
  const second = path.join(workspace, "second.vsix");
  try {
    packageOnce(first);
    packageOnce(second);
    const result = compareVsixContent(first, second);
    if (options.print !== false) {
      console.log(
        `VSIX repeatable content check passed: ${result.entryCount} entries, normalized SHA-256 ${result.contentDigest}`,
      );
    }
    return result;
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkRepeatableVsix();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
