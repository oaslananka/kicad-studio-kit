# KiCad Studio Beta Program

The beta program is the structured feedback loop for KiCad Studio before the
`1.0.0` stable release. It is NDA-free, public by default, and designed to turn
real project feedback into Linear issues without requiring maintainers to infer
what happened from unstructured comments.

## Goals

- Recruit 10-20 beta testers before the first public beta cycle.
- Cover Windows, macOS, and Linux with single-board, multi-board, classroom,
  embedded, and non-English KiCad workflows.
- Complete at least two 2-week beta cycles before `1.0.0` stable.
- Triage every actionable beta report into Linear with the `source:beta` label.
- Keep telemetry and crash reporting opt-in, disabled by default, and bounded by
  the privacy model in [telemetry.md](telemetry.md).

## Beta Channel

Beta builds use GitHub pre-release tags that end with `-beta.N`, for example
`vscode-extension-v1.0.1-beta.1`.

VS Code Marketplace and Open VSX publish these builds as pre-releases. The VSIX
package version remains normal `major.minor.patch` because VS Code marketplace
pre-release packaging requires a distinct normal version plus the pre-release
flag. The publish workflow sets `--pre-release` for beta tags and for manual
workflow runs with `publish_prerelease` enabled.

Auto-update messaging must distinguish stable from beta clearly. Beta
announcements, marketplace release notes, and check-in digests must use "KiCad
Studio Beta" in the title and state that the build is a Marketplace/Open VSX
pre-release. Stable release notes must use "KiCad Studio Stable" and must not
refer to beta-only fixes as generally available until the stable release ships.

Stable releases and beta releases must not share the same extension version. If
`1.0.1` is used for a beta, the next stable release must be `1.0.2` or higher.
Before publishing a stable release, publish the next beta version first so beta
users are not silently moved to stable.

No release, tag, or publish is performed by this document. It defines the
program and CI policy only.

## Enrollment

Enrollment happens through GitHub Discussions. Maintainers must keep repository
Discussions enabled and create a discussion category with the slug
`beta-feedback`. The repository includes the matching structured category form
at `.github/DISCUSSION_TEMPLATE/beta-feedback.yml`.

Target tester mix:

- Hobbyist single-project users.
- Professional multi-board users.
- Educators using KiCad in courses.
- Embedded systems engineers working on SismoSmart or ThermoLink class designs.
- Non-English users, including Turkish, German, and Chinese.
- Windows, macOS, and Linux users.

Every participant agrees to the no NDA policy: do not upload proprietary
schematics, board files, BOMs, secrets, or customer data. Public discussions
should use reduced repro projects, screenshots, logs, or sanitized summaries.

## Feedback Collection

Users can run `KiCad Studio: Send Feedback` from the Command Palette. The
command opens the `beta-feedback` discussion form.

The discussion form captures:

- workflow area;
- KiCad, VS Code, extension, operating system, and MCP versions;
- current install channel;
- privacy-safe reproduction steps;
- whether the user consents to maintainers converting the discussion into a
  tracked Linear/GitHub issue.

Crash and error telemetry remains optional. When enabled, it must stay redacted
and must not include KiCad source files, board contents, user home paths,
hostnames, API keys, or secrets.

## Triage

Triage happens at least weekly during each beta cycle.

1. Review new `beta-feedback` discussions.
2. Ask for a reduced reproduction when the report contains private project data.
3. Convert actionable reports into Linear issues.
4. Apply Linear label `source:beta`.
5. Add product and area labels that match the repository taxonomy.
6. Link the discussion URL from the Linear issue.
7. Close the loop by replying in the original discussion with the Linear issue
   identifier or the reason it is not actionable.
8. Send a weekly async email digest to beta testers covering new beta builds,
   high-impact fixes, open release blockers, and feedback themes. The digest
   must link to public discussions or Linear/GitHub references only, never
   private files or tester email addresses.

If a beta report is release-blocking, add `release-blocker` in GitHub and the
corresponding Linear priority or blocker state.

## 2-Week Beta Cycles

Each cycle is exactly 2 weeks unless a release-blocking defect requires a reset.

| Day   | Owner      | Action                                                      |
| ----- | ---------- | ----------------------------------------------------------- |
| 1     | Maintainer | Publish beta build and update the discussion announcement.  |
| 2-10  | Testers    | Run real KiCad projects and submit structured feedback.     |
| 5     | Maintainer | First triage pass; create Linear issues with `source:beta`. |
| 11    | Maintainer | Second triage pass; pick release blockers.                  |
| 12-13 | Maintainer | Fix or explicitly defer blockers.                           |
| 14    | Maintainer | Publish beta cycle summary and prepare next beta.           |

The public changelog must call out beta-driven fixes under the relevant product
changelog. The cycle summary links the discussions, Linear issues, and merged
PRs that came from beta feedback.

## Recognition

Beta testers who opt into public recognition are listed in
[CONTRIBUTORS.md](../CONTRIBUTORS.md) under "Beta tester recognition". The list
records names or handles only. Do not record email addresses, private project
names, company names, or non-public design details.

## Readiness Checklist

- `beta-feedback` GitHub Discussions category exists.
- `.github/DISCUSSION_TEMPLATE/beta-feedback.yml` is present on the default
  branch.
- Linear label `source:beta` exists for `oaslananka-linear-team`.
- GitHub label `source:beta` exists through `.github/labels.yml`.
- `KiCad Studio: Send Feedback` opens the beta feedback form.
- Publish workflow packages beta tags with `--pre-release`.
- Auto-update and release-note copy distinguishes beta from stable.
- Weekly async email digest is sent during every active beta week.
- At least two beta cycles are completed before `1.0.0` stable.
