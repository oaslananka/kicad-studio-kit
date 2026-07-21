#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptRoot, "..");

function requireIncludes(errors, label, text, expected) {
  if (!text.includes(expected)) {
    errors.push(`${label} must include ${JSON.stringify(expected)}`);
  }
}

function executableErrors(repoRoot, relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) return [`${relativePath} must exist`];
  if (process.platform !== "win32" && (statSync(filePath).mode & 0o111) === 0) {
    return [`${relativePath} must be executable`];
  }
  return [];
}

export function validateValidationHostContract(contract) {
  const errors = [];
  const expectedPins = [
    'node = "24.18.0"',
    'python = "3.13.14"',
    'uv = "0.11.21"',
    'actionlint = "1.7.12"',
    'shellcheck = "0.9.0"',
  ];
  for (const pin of expectedPins) {
    requireIncludes(errors, "mise.toml", contract.miseText, pin);
  }

  for (const phrase of [
    'MISE_DATA_DIR="${HOME}/.local/share/mise"',
    'MISE_CONFIG_FILE="${MISE_CONFIG_DIR}/config.toml"',
    "KICAD_STUDIO_VALIDATION_CACHE_ROOT",
    "KICAD_STUDIO_VALIDATION_APT_ROOT",
    "LD_LIBRARY_PATH",
    "XKB_CONFIG_ROOT",
  ]) {
    requireIncludes(
      errors,
      "validation-host environment",
      contract.commonText,
      phrase,
    );
  }

  for (const phrase of [
    "mise trust --yes",
    "mise install",
    "corepack enable pnpm",
    "pnpm install --frozen-lockfile",
    "playwright install chromium",
    "playwright install-deps --dry-run chromium",
    'apt-get download "${packages[@]}"',
    'dpkg-deb -x "${archive}"',
    ".validation-host-manifest",
    "node scripts/dev-doctor.mjs --ci --strict",
  ]) {
    requireIncludes(errors, "bootstrap script", contract.bootstrapText, phrase);
  }
  if (/\bsudo\b/u.test(contract.bootstrapText)) {
    errors.push("bootstrap script must not invoke sudo");
  }
  if (
    !contract.bootstrapText.includes(
      "playwright install-deps --dry-run chromium",
    )
  ) {
    errors.push("bootstrap script must retain Playwright dependency discovery");
  }

  for (const phrase of [
    "--print-environment",
    "validation_host_activate_rootless_runtime",
    "exec mise exec --",
  ]) {
    requireIncludes(errors, "runner script", contract.runnerText, phrase);
  }

  for (const phrase of [
    "Ubuntu 24.04",
    "KiCad 7.0.11",
    "KiCad MCP Pro",
    "validation-host:doctor",
    "validation-host:check",
    "validation-host:package",
    "$HOME/.cache/kicad-studio-kit",
  ]) {
    requireIncludes(
      errors,
      "docs/validation-host.md",
      contract.docsText,
      phrase,
    );
  }
  requireIncludes(
    errors,
    "README.md",
    contract.readmeText,
    "docs/validation-host.md",
  );
  requireIncludes(
    errors,
    "docs/contributing.md",
    contract.contributingText,
    "validation-host:bootstrap",
  );

  const scripts = contract.packageJson?.scripts ?? {};
  const expectedScripts = {
    "validation-host:bootstrap": "bash scripts/bootstrap-validation-host.sh",
    "validation-host:doctor":
      "bash scripts/run-validation-host.sh node scripts/dev-doctor.mjs --ci --strict",
    "validation-host:check":
      "bash scripts/run-validation-host.sh corepack pnpm run check",
    "validation-host:package":
      "bash scripts/run-validation-host.sh corepack pnpm run package:kicad-studio",
    "check:validation-host":
      "node scripts/check-validation-host.mjs && node --test scripts/check-validation-host.test.mjs",
  };
  for (const [name, expected] of Object.entries(expectedScripts)) {
    if (scripts[name] !== expected) {
      errors.push(`package.json scripts.${name} must be ${expected}`);
    }
  }
  if (!scripts.check?.includes("pnpm run check:validation-host")) {
    errors.push("package.json check must run check:validation-host");
  }

  return errors;
}

export function validateValidationHostRepository(repoRoot = defaultRepoRoot) {
  const read = (relativePath) =>
    readFileSync(path.join(repoRoot, relativePath), "utf8");
  const errors = validateValidationHostContract({
    miseText: read("mise.toml"),
    commonText: read("scripts/lib/validation-host-env.sh"),
    bootstrapText: read("scripts/bootstrap-validation-host.sh"),
    runnerText: read("scripts/run-validation-host.sh"),
    docsText: read("docs/validation-host.md"),
    readmeText: read("README.md"),
    contributingText: read("docs/contributing.md"),
    packageJson: JSON.parse(read("package.json")),
  });
  errors.push(
    ...executableErrors(repoRoot, "scripts/bootstrap-validation-host.sh"),
    ...executableErrors(repoRoot, "scripts/run-validation-host.sh"),
  );
  return errors;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const errors = validateValidationHostRepository();
  if (errors.length > 0) {
    console.error("Validation-host contract failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Validation-host contract passed.");
  }
}
