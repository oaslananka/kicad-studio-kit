$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

Write-Host '==> pnpm audit'
pnpm audit --audit-level high

Write-Host '==> gitleaks'
$gitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
if (-not $gitleaks) {
  Write-Error 'gitleaks is required for local security checks. Install it from https://github.com/gitleaks/gitleaks.'
}
gitleaks detect --no-banner --redact

Write-Host '==> bundle size'
if (-not (Get-ChildItem -LiteralPath $root -Filter '*.vsix' -File -ErrorAction SilentlyContinue) -or -not (Test-Path -LiteralPath (Join-Path $root 'dist/extension.js'))) {
  pnpm run package
}
pnpm run check:bundle-size
