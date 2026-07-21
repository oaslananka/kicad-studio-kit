#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateValidationHostContract,
  validateValidationHostRepository,
} from "./check-validation-host.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function repositoryContract() {
  return {
    miseText: readFileSync(path.join(repoRoot, "mise.toml"), "utf8"),
    commonText: readFileSync(
      path.join(repoRoot, "scripts/lib/validation-host-env.sh"),
      "utf8",
    ),
    bootstrapText: readFileSync(
      path.join(repoRoot, "scripts/bootstrap-validation-host.sh"),
      "utf8",
    ),
    runnerText: readFileSync(
      path.join(repoRoot, "scripts/run-validation-host.sh"),
      "utf8",
    ),
    docsText: readFileSync(
      path.join(repoRoot, "docs/validation-host.md"),
      "utf8",
    ),
    readmeText: readFileSync(path.join(repoRoot, "README.md"), "utf8"),
    contributingText: readFileSync(
      path.join(repoRoot, "docs/contributing.md"),
      "utf8",
    ),
    packageJson: JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ),
  };
}

test("validation-host repository contract is complete (#490)", () => {
  assert.deepEqual(validateValidationHostRepository(repoRoot), []);
});

test("stale or weakened tool pins are rejected (#490)", () => {
  const contract = repositoryContract();
  contract.miseText = contract.miseText.replace(
    'python = "3.13.14"',
    'python = "3.12.3"',
  );

  assert.match(
    validateValidationHostContract(contract).join("\n"),
    /mise\.toml must include.*3\.13\.14/u,
  );
});

test("bootstrap accepts Playwright's missing-dependency discovery status (#490)", () => {
  const bootstrapText = repositoryContract().bootstrapText;

  assert.match(bootstrapText, /playwright_dependency_status=\$\?/u);
  assert.match(bootstrapText, /Missing system dependencies/u);
});

test("bootstrap must remain rootless and derive Playwright packages (#490)", () => {
  const contract = repositoryContract();
  contract.bootstrapText = contract.bootstrapText
    .replaceAll("playwright install-deps --dry-run chromium", "true")
    .replace('apt-get download "${packages[@]}"', "sudo apt-get install xvfb");

  const errors = validateValidationHostContract(contract).join("\n");
  assert.match(errors, /Playwright dependency discovery/u);
  assert.match(errors, /apt-get download/u);
  assert.match(errors, /must not invoke sudo/u);
});

test("root package exposes bootstrap, doctor, check, and package entrypoints (#490)", () => {
  const scripts = repositoryContract().packageJson.scripts;

  assert.equal(
    scripts["validation-host:bootstrap"],
    "bash scripts/bootstrap-validation-host.sh",
  );
  assert.equal(
    scripts["validation-host:doctor"],
    "bash scripts/run-validation-host.sh node scripts/dev-doctor.mjs --ci --strict",
  );
  assert.equal(
    scripts["validation-host:check"],
    "bash scripts/run-validation-host.sh corepack pnpm run check",
  );
  assert.equal(
    scripts["validation-host:package"],
    "bash scripts/run-validation-host.sh corepack pnpm run package:kicad-studio",
  );
  assert.equal(
    scripts["check:validation-host"],
    "node scripts/check-validation-host.mjs && node --test scripts/check-validation-host.test.mjs",
  );
  assert.match(scripts.check, /pnpm run check:validation-host/u);
});

test("runner isolates mise and runtime paths under the executing HOME (#490)", (t) => {
  const home = mkdtempSync(path.join(os.tmpdir(), "kicad-validation-home-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const result = spawnSync(
    "bash",
    [
      path.join(repoRoot, "scripts/run-validation-host.sh"),
      "--print-environment",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: home,
        MISE_CONFIG_FILE: "/home/opsrunner/leaked.toml",
        KICAD_STUDIO_MISE_DATA_DIR: "/tmp/leaked-mise",
        KICAD_STUDIO_VALIDATION_CACHE_ROOT: "/tmp/leaked-validation",
        PLAYWRIGHT_BROWSERS_PATH: "/tmp/leaked-playwright",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(`MISE_DATA_DIR=${home}/\\.local/share/mise`, "u"),
  );
  assert.match(
    result.stdout,
    new RegExp(`MISE_CONFIG_FILE=${home}/\\.config/mise/config\\.toml`, "u"),
  );
  assert.match(
    result.stdout,
    new RegExp(
      `KICAD_STUDIO_VALIDATION_CACHE_ROOT=${home}/\\.cache/kicad-studio-kit`,
      "u",
    ),
  );
  assert.match(
    result.stdout,
    new RegExp(`PLAYWRIGHT_BROWSERS_PATH=${home}/\\.cache/ms-playwright`, "u"),
  );
  assert.doesNotMatch(result.stdout, /\/home\/opsrunner|\/tmp\/leaked/u);
});
