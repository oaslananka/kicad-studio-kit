#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const extensionDir =
  process.env["STUDIO_NLS_TEST_DIRECTORY"] ??
  path.join(repoRoot, "apps", "vscode-extension");
const errors = [];
let base;
try {
  base = JSON.parse(
    fs.readFileSync(path.join(extensionDir, "package.nls.json"), "utf8"),
  );
} catch (error) {
  errors.push(`English package.nls.json must be readable: ${String(error)}`);
}

if (base) {
  if (!base || typeof base !== "object" || Array.isArray(base)) {
    errors.push("English message catalog must contain an object");
  } else {
    for (const [key, value] of Object.entries(base)) {
      if (typeof value !== "string" || !value.trim()) {
        errors.push(`English message must be a nonempty string: ${key}`);
      }
    }
  }
}

try {
  for (const file of fs.readdirSync(extensionDir)) {
    if (/^package\.nls\..+\.json$/u.test(file)) {
      errors.push(
        `Additional locale catalog is prohibited (English-only): ${file}`,
      );
    }
  }
} catch (error) {
  errors.push(`Cannot inspect extension catalog directory: ${String(error)}`);
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(
    `English-only NLS catalog verified (${Object.keys(base).length} keys; no additional locales)`,
  );
}
