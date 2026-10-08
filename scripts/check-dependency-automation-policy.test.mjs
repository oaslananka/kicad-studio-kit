import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { validateDependencyAutomationPolicy } from "./check-dependency-automation-policy.mjs";
import { scanForbiddenReferences } from "./check-no-forbidden-refs.mjs";

const relevant = [
  ".github/retired-dependency-manifests.json",
  "docs/security.md",
  "docs/dependency-lifecycle.md",
  "package.json",
  "renovate.json",
];
function fixture() {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "kicad-dependency-automation-"),
  );
  for (const file of relevant) {
    const destination = path.join(root, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(file, destination);
  }
  return root;
}
function usingFixture(fn) {
  const root = fixture();
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function mutateJson(root, file, fn) {
  const destination = path.join(root, file);
  const data = JSON.parse(readFileSync(destination, "utf8"));
  fn(data);
  writeFileSync(destination, JSON.stringify(data, null, 2) + "\n");
}

test("#728 current Renovate-only ownership and retired-manifest policy pass", () => {
  assert.deepEqual(validateDependencyAutomationPolicy(), []);
});
test("#728 legacy Dependabot updater config cannot return", () => {
  usingFixture((root) => {
    writeFileSync(
      path.join(root, ".github/dependabot.yml"),
      "version: 2\nupdates: []\n",
    );
    assert.ok(
      validateDependencyAutomationPolicy(root).some((error) =>
        error.includes("must remain absent"),
      ),
    );
  });
});
test("#728 disabling Renovate vulnerability alerts fails closed", () => {
  usingFixture((root) => {
    mutateJson(root, "renovate.json", (config) => {
      config.vulnerabilityAlerts.enabled = false;
    });
    assert.ok(
      validateDependencyAutomationPolicy(root).some((error) =>
        error.includes("vulnerabilityAlerts"),
      ),
    );
  });
});
test("#728 disabling Renovate dependency dashboard fails closed", () => {
  usingFixture((root) => {
    mutateJson(root, "renovate.json", (config) => {
      config.dependencyDashboard = false;
    });
    assert.ok(
      validateDependencyAutomationPolicy(root).some((error) =>
        error.includes("dependencyDashboard"),
      ),
    );
  });
});
test("#728 root check cannot silently drop automation policy", () => {
  usingFixture((root) => {
    mutateJson(root, "package.json", (pkg) => {
      delete pkg.scripts["check:dependency-automation-policy"];
      pkg.scripts.check = pkg.scripts.check.replace(
        " && pnpm run check:dependency-automation-policy",
        "",
      );
    });
    assert.ok(
      validateDependencyAutomationPolicy(root).some((error) =>
        error.includes("Root check"),
      ),
    );
  });
});
test("#728 security docs cannot silently drift to stale ownership", () => {
  usingFixture((root) => {
    const filename = path.join(root, "docs/security.md");
    writeFileSync(
      filename,
      readFileSync(filename, "utf8").replace(
        "Renovate is the sole dependency-update PR author",
        "Unowned dependency PRs",
      ),
    );
    assert.ok(
      validateDependencyAutomationPolicy(root).some((error) =>
        error.includes("docs/security.md"),
      ),
    );
  });
});
test("#728 forbidden-reference scanner retains its unrelated protection", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "kicad-forbidden-dependency-"),
  );
  try {
    mkdirSync(path.join(root, "docs"), { recursive: true });
    writeFileSync(
      path.join(root, "docs/security.md"),
      "Dependabot alert service\n",
    );
    assert.deepEqual(scanForbiddenReferences(root), []);
    writeFileSync(
      path.join(root, "README.md"),
      "Dependabot must not become PR author.\n",
    );
    assert.ok(
      scanForbiddenReferences(root).some(
        (hit) => hit.file === "README.md" && hit.pattern === "dependabot",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#728 CLI reports the canonical Renovate policy as passing", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/check-dependency-automation-policy.mjs"],
    {
      encoding: "utf8",
    },
  );
  assert.match(output, /Renovate-only dependency automation policy passed/);
});
