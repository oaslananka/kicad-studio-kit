#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../apps/vscode-extension",
);

export function auditEnglishCatalog(base, files) {
  const errors = [];
  if (!base || typeof base !== "object" || Array.isArray(base)) {
    errors.push("English message catalog must be a JSON object");
  } else {
    for (const [key, value] of Object.entries(base)) {
      if (typeof value !== "string" || !value.trim())
        errors.push(`English message must be a nonempty string: ${key}`);
    }
  }
  for (const name of files) {
    if (/^package\.nls\..+\.json$/u.test(name))
      errors.push(
        `Additional locale catalog is prohibited (English-only): ${name}`,
      );
  }
  return errors;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const base = JSON.parse(
    fs.readFileSync(path.join(extensionDir, "package.nls.json"), "utf8"),
  );
  const errors = auditEnglishCatalog(base, fs.readdirSync(extensionDir));
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(
      `English-only NLS catalog verified (${Object.keys(base).length} keys; no additional locales)`,
    );
  }
}
