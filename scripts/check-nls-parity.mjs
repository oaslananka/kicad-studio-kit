#!/usr/bin/env node
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import englishMessages from "../apps/vscode-extension/package.nls.json" with { type: "json" };

const extensionDir = fileURLToPath(
  new URL("../apps/vscode-extension/", import.meta.url),
);

export function auditEnglishCatalog(base, files) {
  const errors = [];
  if (!base || typeof base !== "object" || Array.isArray(base)) {
    errors.push("English message catalog must be a JSON object");
  } else {
    for (const [key, value] of Object.entries(base)) {
      if (typeof value !== "string" || !value.trim()) {
        errors.push(`English message must be a nonempty string: ${key}`);
      }
    }
  }
  for (const name of files) {
    if (/^package\.nls\..+\.json$/u.test(name)) {
      errors.push(
        `Additional locale catalog is prohibited (English-only): ${name}`,
      );
    }
  }
  return errors;
}

if (import.meta.main) {
  const errors = auditEnglishCatalog(
    englishMessages,
    globSync("package.nls.*.json", { cwd: extensionDir }),
  );
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(
      `English-only NLS catalog verified (${Object.keys(englishMessages).length} keys; no additional locales)`,
    );
  }
}
