$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$extensionRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $extensionRoot '../..')).Path
Set-Location -LiteralPath $repoRoot

Write-Host '==> pre-commit'
uvx --from pre-commit==4.6.0 pre-commit run --all-files

Write-Host '==> pnpm audit'
corepack pnpm audit --audit-level high

Write-Host '==> gitleaks'
$gitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
if (-not $gitleaks) {
  Write-Error 'gitleaks is required for local security checks. Install it from https://github.com/gitleaks/gitleaks.'
}
gitleaks detect --source . --no-banner --redact

Write-Host '==> GitHub Actions policy'
corepack pnpm run security:workflows

Write-Host '==> Semgrep rule tests'
corepack pnpm run test:semgrep-rules

Write-Host '==> Semgrep repository invariants'
corepack pnpm run security:semgrep

Write-Host '==> bundle size'
Set-Location -LiteralPath $extensionRoot
if (-not (Get-ChildItem -LiteralPath $extensionRoot -Filter '*.vsix' -File -ErrorAction SilentlyContinue) -or -not (Test-Path -LiteralPath (Join-Path $extensionRoot 'dist/extension.js'))) {
  corepack pnpm run package
}
corepack pnpm run check:bundle-size
