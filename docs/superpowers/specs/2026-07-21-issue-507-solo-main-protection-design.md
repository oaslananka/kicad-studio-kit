# Issue 507 Solo-Maintainer Main Protection Design

## Goal

Protect `main` against direct, destructive, or unverified changes without requiring an unavailable second maintainer to approve the repository owner's pull requests.

## Policy

`main` remains pull-request-only. Green required checks, strict up-to-date validation, signed commits, conversation resolution, deletion protection, and non-fast-forward protection remain mandatory. Approval count becomes zero, and CODEOWNERS plus last-push approval requirements are disabled because the project has one maintainer.

Repository administrators retain only pull-request-mode bypass. This permits emergency administration through a PR while continuing to block direct pushes to `main`.

## Evidence

The checked-in JSON is the source of truth. Contract tests assert the solo-maintainer parameters and required check set. After merge, the same JSON will be applied through the GitHub rulesets API and the governance evidence workflow will confirm exact live parity.
