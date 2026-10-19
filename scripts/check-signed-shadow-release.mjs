import { readFileSync, writeFileSync } from "node:fs";

/**
 * Validate the one exceptional Release Please path: GitHub-signed shadow PRs
 * rebased onto current main receive a -r<run-id> suffix that upstream does not
 * recognize during automatic release tagging. Never accept arbitrary PRs.
 */
export function selectSignedShadowRelease(prs, repository, mergedSha) {
  if (!/^[0-9a-f]{40}$/u.test(mergedSha)) {
    throw new Error("Expected a full merged commit SHA");
  }
  const matches = prs.filter((pr) => pr.merge_commit_sha === mergedSha);
  if (matches.length !== 1) {
    throw new Error("Expected exactly one associated merged PR");
  }
  const pr = matches[0];
  const title =
    /^chore\(main\): release vscode-extension (\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?)$/u.exec(
      pr.title ?? "",
    );
  if (
    !title ||
    !pr.merged_at ||
    pr.base?.ref !== "main" ||
    pr.base?.repo?.full_name !== repository ||
    pr.head?.repo?.full_name !== repository ||
    !/^release-please\/branches\/main\/components\/vscode-extension-r\d+$/u.test(
      pr.head?.ref ?? "",
    ) ||
    !/^[0-9a-f]{40}$/u.test(pr.head?.sha ?? "")
  ) {
    throw new Error("Merged PR is not a trusted signed release shadow");
  }
  return {
    version: title[1],
    tag: `vscode-extension-v${title[1]}`,
    headSha: pr.head.sha,
    isPrerelease: title[1].includes("-"),
  };
}

export function extractSignedReleaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/u);
  const first = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (first === -1 || !/^## \[[0-9]/u.test(lines[first])) {
    throw new Error(`Missing changelog entry for ${version}`);
  }
  const end = lines.findIndex(
    (line, index) => index > first && /^## \[[0-9]/u.test(line),
  );
  const notes = lines
    .slice(first, end === -1 ? undefined : end)
    .join("\n")
    .trim();
  if (!notes.includes("\n") || notes.length < 50) {
    throw new Error("Release notes cannot be empty or heading-only");
  }
  return notes + "\n";
}

export function verifySignedReleaseVersion(manifest, packageJson, version) {
  if (
    manifest["apps/vscode-extension"] !== version ||
    packageJson.version !== version
  ) {
    throw new Error("Merged release manifest and package version disagree");
  }
}

function cli() {
  const [
    prsPath,
    repository,
    mergedSha,
    manifestPath,
    packagePath,
    changelogPath,
    notesPath,
    outputPath,
  ] = process.argv.slice(2);
  if (!outputPath) throw new Error("Expected release validation CLI arguments");
  const prs = JSON.parse(readFileSync(prsPath, "utf8"));
  const release = selectSignedShadowRelease(prs, repository, mergedSha);
  verifySignedReleaseVersion(
    JSON.parse(readFileSync(manifestPath, "utf8")),
    JSON.parse(readFileSync(packagePath, "utf8")),
    release.version,
  );
  const notes = extractSignedReleaseNotes(
    readFileSync(changelogPath, "utf8"),
    release.version,
  );
  writeFileSync(notesPath, notes);
  writeFileSync(
    outputPath,
    `tag=${release.tag}\nhead=${release.headSha}\nprerelease=${release.isPrerelease}\n`,
    { flag: "a" },
  );
  console.log(`Validated signed release shadow ${release.tag} on ${mergedSha}`);
}

if (process.argv[1]?.endsWith("/check-signed-shadow-release.mjs")) {
  cli();
}
