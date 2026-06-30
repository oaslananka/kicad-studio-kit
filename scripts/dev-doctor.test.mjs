import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDoctorReport,
  detectDevelopmentEnvironment,
  formatHumanReport,
  selectWindowsCommand,
  satisfiesSimpleRange,
} from "./dev-doctor.mjs";

test("dev-doctor detects the devcontainer marker and Codespaces", () => {
  assert.deepEqual(
    detectDevelopmentEnvironment({
      KICAD_STUDIO_DEVCONTAINER: "1",
    }),
    {
      isDevcontainer: true,
      isCodespaces: false,
      markers: ["KICAD_STUDIO_DEVCONTAINER=1"],
    },
  );

  assert.deepEqual(
    detectDevelopmentEnvironment({
      CODESPACES: "true",
    }),
    {
      isDevcontainer: true,
      isCodespaces: true,
      markers: ["CODESPACES=true"],
    },
  );
});

test("dev-doctor enforces the repository Node runtime policy", () => {
  assert.equal(satisfiesSimpleRange("24.11.0", ">=24.11.0 <25"), true);
  assert.equal(satisfiesSimpleRange("24.16.0", ">=24.11.0 <25"), true);
  assert.equal(satisfiesSimpleRange("24.10.0", ">=24.11.0 <25"), false);
  assert.equal(satisfiesSimpleRange("25.0.0", ">=24.11.0 <25"), false);
});

test("dev-doctor prefers executable Windows command shims", () => {
  assert.equal(
    selectWindowsCommand(
      "corepack",
      [
        "C:\\Program Files\\nodejs\\corepack",
        "C:\\Program Files\\nodejs\\corepack.cmd",
        "",
      ].join("\r\n"),
    ),
    "C:\\Program Files\\nodejs\\corepack.cmd",
  );
  assert.equal(selectWindowsCommand("missing", ""), "missing");
});

test("dev-doctor reports the full CI-safe monorepo environment contract", async () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "kicad-dev-doctor-"));
  try {
    mkdirSync(path.join(repoRoot, "apps/vscode-extension/node_modules/.bin"), {
      recursive: true,
    });
    mkdirSync(path.join(repoRoot, "playwright-cache/chromium-1228"), {
      recursive: true,
    });
    writeFileSync(
      path.join(
        repoRoot,
        "playwright-cache/chromium-1228/INSTALLATION_COMPLETE",
      ),
      "ok\n",
    );
    mkdirSync(path.join(repoRoot, "packages/kicad-fixtures"), {
      recursive: true,
    });

    writeFileSync(
      path.join(repoRoot, "package.json"),
      JSON.stringify(
        {
          packageManager: "pnpm@11.3.0",
          engines: { node: ">=24.11.0 <25", pnpm: ">=11.0.0 <12" },
          scripts: {
            "dev-doctor": "node scripts/dev-doctor.mjs",
            "dev:doctor": "node scripts/dev-doctor.mjs",
            "check:dev-doctor": "node scripts/dev-doctor.mjs --ci --strict",
            "check:kicad-studio": "pnpm --filter kicadstudiokit run check",
            "check:fixtures":
              "node scripts/generate-kicad-fixture-corpus.mjs --check && node --test scripts/check-kicad-fixtures-package.test.mjs && pnpm --dir packages/kicad-fixtures run check",
            "check:kicad-fixtures":
              "pnpm --dir packages/kicad-fixtures run check",
            "check:protocol-schemas":
              "node --test scripts/check-protocol-schemas-package.test.mjs && node --input-type=module -e \"import * as pkg from '@oaslananka/kicad-protocol-schemas'; if (typeof pkg.validateProtocolPayload !== 'function') throw new Error('validateProtocolPayload export missing'); console.log('protocol-schemas resolves OK: validateProtocolPayload present')\"",
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(path.join(repoRoot, ".node-version"), "24\n");
    writeFileSync(path.join(repoRoot, ".python-version"), "3.13\n");
    writeFileSync(
      path.join(repoRoot, "apps/vscode-extension/package.json"),
      JSON.stringify({ name: "kicadstudio" }),
    );
    writeFileSync(
      path.join(repoRoot, "compatibility.yaml"),
      [
        "schemaVersion: 1",
        "kicad:",
        '  primary: "10.0.x"',
        "node:",
        '  range: ">=24.11.0 <25"',
        "python:",
        '  range: ">=3.13"',
      ].join("\n"),
    );
    writeFileSync(
      path.join(repoRoot, "packages/kicad-fixtures/manifest.json"),
      JSON.stringify({ schemaVersion: 1, fixtureCount: 1, fixtures: [] }),
    );

    const report = await createDoctorReport(repoRoot, {
      env: { KICAD_STUDIO_DEVCONTAINER: "1" },
      ci: true,
      commandRunner(command, args) {
        const joined = [command, ...args].join(" ");
        if (joined === "corepack pnpm --version") {
          return { ok: true, status: 0, stdout: "11.3.0", stderr: "" };
        }
        if (
          joined ===
          "corepack pnpm --dir apps/vscode-extension exec playwright install --dry-run chromium"
        ) {
          return {
            ok: true,
            status: 0,
            stdout: `Chrome for Testing 149.0.7827.55 (playwright chromium v1228)
  Install location:    ${path.join(repoRoot, "playwright-cache/chromium-1228")}
`,
            stderr: "",
          };
        }
        if (joined === "python3 --version") {
          return { ok: true, status: 0, stdout: "Python 3.13.8", stderr: "" };
        }
        if (joined === "uv --version") {
          return { ok: true, status: 0, stdout: "uv 0.11.16", stderr: "" };
        }
        if (joined.includes("import kicad_mcp")) {
          return {
            ok: true,
            status: 0,
            stdout: "kicad_mcp import ok",
            stderr: "",
          };
        }
        if (joined.includes("kicad-mcp-pro --help")) {
          return {
            ok: true,
            status: 0,
            stdout: "Usage: kicad-mcp-pro",
            stderr: "",
          };
        }
        if (joined.includes("kicad-mcp-pro version --json")) {
          return {
            ok: true,
            status: 0,
            stdout: JSON.stringify({ package: { version: "3.5.2" } }),
            stderr: "",
          };
        }
        if (joined.includes("kicad-mcp-pro doctor --json")) {
          return {
            ok: true,
            status: 0,
            stdout: JSON.stringify({
              schemaVersion: "1.0.0",
              status: "degraded",
              recent_errors: ["kicad_ipc: unavailable"],
            }),
            stderr: "",
          };
        }
        if (joined === "corepack pnpm run check:fixtures") {
          return {
            ok: true,
            status: 0,
            stdout: "Fixture corpus is current.",
            stderr: "",
          };
        }
        if (joined === "kicad-cli version") {
          return { ok: false, status: 127, stdout: "", stderr: "not found" };
        }
        if (joined === "cloudflared --version") {
          return { ok: false, status: 127, stdout: "", stderr: "not found" };
        }
        return { ok: true, status: 0, stdout: `${command} ok`, stderr: "" };
      },
      portProbe(port) {
        return Promise.resolve({
          ok: true,
          detail: `127.0.0.1:${port} available`,
        });
      },
    });

    const byId = new Map(report.checks.map((check) => [check.id, check]));
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.status, "ok");
    assert.deepEqual(
      [
        "node",
        "pnpm",
        "python",
        "uv",
        "kicad-cli",
        "vscode-extension-deps",
        "playwright-chromium",
        "cloudflared",
        "ports",
        "workspace-scripts",
        "fixture-corpus",
        "protocol-schemas",
      ].filter((id) => !byId.has(id)),
      [],
    );
    assert.equal(byId.get("kicad-cli").required, false);
    assert.equal(byId.get("cloudflared").required, false);
    assert.match(
      byId.get("protocol-schemas").detail,
      /schema file\(s\) parsed/,
    );
    assert.equal(
      report.checks.every(
        (check) => typeof check.hint === "string" && check.hint.length > 0,
      ),
      true,
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("dev-doctor human output includes actionable fix hints", () => {
  const output = formatHumanReport({
    schemaVersion: 1,
    status: "failed",
    environment: {
      platform: "linux",
      arch: "x64",
      isDevcontainer: false,
      isCodespaces: false,
      markers: [],
    },
    checks: [
      {
        id: "uv",
        label: "uv",
        category: "tools",
        required: true,
        ok: false,
        status: "fail",
        detail: "command not found",
        hint: "Install uv from https://docs.astral.sh/uv/.",
      },
    ],
  });

  assert.match(output, /Status: failed/);
  assert.match(output, /hint: Install uv/);
});
