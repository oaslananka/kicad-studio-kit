#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse as parseYaml } from "yaml";

import { validateVscodeTypingsPolicy } from "./check-vscode-typings-policy.mjs";

const repositoryCompatibility = parseYaml(
  fs.readFileSync("compatibility.yaml", "utf8"),
);
const repositoryExtensionPackage = JSON.parse(
  fs.readFileSync("apps/vscode-extension/package.json", "utf8"),
);
const repositoryRenovateConfig = JSON.parse(
  fs.readFileSync("renovate.json", "utf8"),
);

function alignedFixture() {
  return {
    compatibility: {
      vscode: {
        minimum: "1.101.0",
        enginesRange: "^1.101.0",
      },
    },
    extensionPackage: {
      engines: { vscode: "^1.101.0" },
      devDependencies: { "@types/vscode": "1.101.0" },
    },
    renovateConfig: {
      packageRules: [
        {
          matchPackageNames: ["@types/vscode"],
          allowedVersions: "<=1.101.0",
        },
      ],
    },
  };
}

test("aligned VS Code typings policy passes (#489)", () => {
  assert.deepEqual(validateVscodeTypingsPolicy(alignedFixture()), []);
});

test("stale Renovate cap reports the expected minimum (#489)", () => {
  const fixture = alignedFixture();
  fixture.renovateConfig.packageRules[0].allowedVersions = "<=1.99.0";

  assert.match(
    validateVscodeTypingsPolicy(fixture).join("\n"),
    /renovate\.json.*<=1\.101\.0.*<=1\.99\.0/u,
  );
});

test("compatibility metadata drift is rejected (#489)", () => {
  const fixture = alignedFixture();
  fixture.compatibility.vscode.minimum = "1.100.0";
  fixture.compatibility.vscode.enginesRange = "^1.100.0";

  const errors = validateVscodeTypingsPolicy(fixture).join("\n");
  assert.match(errors, /compatibility\.yaml vscode\.minimum/u);
  assert.match(errors, /compatibility\.yaml vscode\.enginesRange/u);
});

test("typings above the supported minimum are rejected (#489)", () => {
  const fixture = alignedFixture();
  fixture.extensionPackage.devDependencies["@types/vscode"] = "1.102.0";

  assert.match(
    validateVscodeTypingsPolicy(fixture).join("\n"),
    /@types\/vscode.*1\.101\.0.*1\.102\.0/u,
  );
});

test("repository policy and root script wiring are current (#489)", () => {
  const rootPackage = JSON.parse(fs.readFileSync("package.json", "utf8"));

  assert.deepEqual(
    validateVscodeTypingsPolicy({
      compatibility: repositoryCompatibility,
      extensionPackage: repositoryExtensionPackage,
      renovateConfig: repositoryRenovateConfig,
    }),
    [],
  );
  assert.equal(
    rootPackage.scripts["check:vscode-typings-policy"],
    "node scripts/check-vscode-typings-policy.mjs && node --test scripts/check-vscode-typings-policy.test.mjs",
  );
  assert.match(
    rootPackage.scripts.check,
    /check:compatibility-contract && pnpm run check:vscode-typings-policy/u,
  );
});
