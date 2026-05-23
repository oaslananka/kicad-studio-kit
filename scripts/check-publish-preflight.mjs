#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const version = "1.0.0";
const requiredEnvironments = [
  "extension-marketplaces",
  "pypi",
  "testpypi",
  "npm",
  "mcp-registry",
  "release",
];
const requiredSecrets = {
  "extension-marketplaces": ["VSCE_PAT", "OVSX_PAT"],
};

function run(command, args) {
  const executable =
    process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  return spawnSync(executable, args, { encoding: "utf8" });
}

const failures = [];
const npm = run("npm", [
  "view",
  `@oaslananka/kicad-mcp-pro@${version}`,
  "version",
  "--json",
]);
if (npm.status === 0 && npm.stdout.trim()) {
  failures.push(
    `npm package @oaslananka/kicad-mcp-pro@${version} already exists`,
  );
}

const pip = run("python", ["-m", "pip", "index", "versions", "kicad-mcp-pro"]);
if (
  pip.status === 0 &&
  new RegExp(`\\b${version.replaceAll(".", "\\.")}\\b`).test(
    `${pip.stdout}\n${pip.stderr}`,
  )
) {
  failures.push(
    `Python package kicad-mcp-pro ${version} already appears in package index output`,
  );
}

console.log("Required GitHub environments:");
for (const env of requiredEnvironments) console.log(`- ${env}`);
console.log("Required secrets:");
for (const [env, secrets] of Object.entries(requiredSecrets)) {
  for (const secret of secrets) console.log(`- ${secret}: ${env}`);
}
console.log("Trusted publishers:");
console.log(
  "- PyPI/TestPyPI: owner oaslananka, repository kicad-studio-kit, workflow publish-python.yml, environments pypi/testpypi",
);
console.log(
  "- npm: package @oaslananka/kicad-mcp-pro, provider GitHub Actions, workflow publish-npm.yml, environment npm",
);
console.log(
  "- MCP Registry: io.github.oaslananka/kicad-mcp-pro via GitHub OIDC",
);
console.log(
  "- Open VSX: namespace oaslananka, workflow publish-extension.yml, environment extension-marketplaces, secret OVSX_PAT",
);

if (failures.length > 0) {
  console.error("Publish preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Publish preflight passed: target versions were not found in npm/PyPI checks.",
);
