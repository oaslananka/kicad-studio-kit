import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDoctorReport,
  detectDevelopmentEnvironment,
  formatHumanReport,
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

test("dev-doctor reports the full CI-safe monorepo environment contract", async () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "kicad-dev-doctor-"));
  try {
    mkdirSync(path.join(repoRoot, "apps/vscode-extension/node_modules/.bin"), {
      recursive: true,
    });
    mkdirSync(path.join(repoRoot, "packages/mcp-server"), { recursive: true });
    mkdirSync(
      path.join(repoRoot, "apps/vscode-extension/test/fixtures/kicad"),
      { recursive: true },
    );
    mkdirSync(path.join(repoRoot, "packages/protocol-schemas/schemas"), {
      recursive: true,
    });
    writeFileSync(
      path.join(repoRoot, "package.json"),
      JSON.stringify(
        {
          packageManager: "pnpm@11.0.8",
          engines: { node: ">=24.11.0 <25", pnpm: ">=11.0.0 <12" },
          scripts: {
            "dev-doctor": "node scripts/dev-doctor.mjs",
            "dev:doctor": "node scripts/dev-doctor.mjs",
            "check:dev-doctor": "node scripts/dev-doctor.mjs --ci --strict",
            "check:kicad-studio": "pnpm --filter kicadstudio run check",
            "check:kicad-mcp-pro": "pnpm --dir packages/mcp-server run check",
            "check:mcp-npm": "pnpm --dir packages/mcp-npm run check",
            "check:fixtures":
              "node scripts/generate-kicad-fixture-corpus.mjs --check",
            "test:contract":
              "pnpm --dir packages/mcp-server run test:transport-contract",
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(path.join(repoRoot, ".node-version"), "24\n");
    writeFileSync(path.join(repoRoot, ".python-version"), "3.12\n");
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
        '  range: ">=3.12"',
      ].join("\n"),
    );
    writeFileSync(
      path.join(
        repoRoot,
        "apps/vscode-extension/test/fixtures/kicad/manifest.json",
      ),
      JSON.stringify({ schemaVersion: 1, fixtureCount: 1, fixtures: [] }),
    );
    writeFileSync(
      path.join(
        repoRoot,
        "packages/protocol-schemas/schemas/kicad-mcp-server-info.schema.json",
      ),
      JSON.stringify({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://example.invalid/schema.json",
        type: "object",
      }),
    );

    const report = await createDoctorReport(repoRoot, {
      env: { KICAD_STUDIO_DEVCONTAINER: "1" },
      ci: true,
      commandRunner(command, args) {
        const joined = [command, ...args].join(" ");
        if (joined === "corepack pnpm --version") {
          return { ok: true, status: 0, stdout: "11.0.8", stderr: "" };
        }
        if (joined === "python3 --version") {
          return { ok: true, status: 0, stdout: "Python 3.12.3", stderr: "" };
        }
        if (joined === "uv --version") {
          return { ok: true, status: 0, stdout: "uv 0.11.12", stderr: "" };
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
            stdout: JSON.stringify({ package: { version: "1.0.0" } }),
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
        "mcp-workspace",
        "kicad-cli",
        "vscode-extension-deps",
        "mcp-help",
        "mcp-version",
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
    assert.equal(byId.get("mcp-version").detail, "kicad-mcp-pro 1.0.0");
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
