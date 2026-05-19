#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

const FAILURE_CLASSES = [
  {
    id: 'marketplace-token-missing',
    patterns: [
      /\bVSCE_PAT\b.*(missing|required|invalid|expired)/i,
      /\bvsce\b.*(pat|token).*(missing|required|invalid|expired)/i,
      /personal access token.*(missing|required|invalid|expired)/i
    ],
    rootCause:
      'Visual Studio Marketplace publish credentials are missing, invalid, expired, or not available to the guarded release environment.',
    recommendedFix:
      'Stop publishing and verify the VSCE_PAT secret, Marketplace publisher access, and release environment approval before retrying.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'vscode-marketplace-publish-failed',
    patterns: [
      /\bvsce\s+publish\b.*(failed|error|denied)/i,
      /visual studio marketplace.*publish.*(failed|error|denied)/i,
      /marketplace.*upload.*(failed|error|denied)/i
    ],
    rootCause: 'The Visual Studio Marketplace publish step failed.',
    recommendedFix:
      'Stop publishing, inspect the release log, verify the VSIX payload and publisher credentials, then retry only through the guarded Release workflow.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'open-vsx-token-missing',
    patterns: [
      /\bOVSX_PAT\b.*(missing|required|invalid|expired)/i,
      /\bovsx\b.*(pat|token).*(missing|required|invalid|expired)/i,
      /open vsx.*token.*(missing|required|invalid|expired)/i
    ],
    rootCause:
      'Open VSX publish credentials are missing, invalid, expired, or not available to the guarded release environment.',
    recommendedFix:
      'Stop publishing and verify the OVSX_PAT secret, Open VSX namespace access, and release environment approval before retrying.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'open-vsx-publish-failed',
    patterns: [
      /\bovsx\s+publish\b.*(failed|error|denied)/i,
      /open vsx.*publish.*(failed|error|denied)/i
    ],
    rootCause: 'The Open VSX publish step failed.',
    recommendedFix:
      'Stop publishing, inspect the release log, verify the VSIX payload and Open VSX namespace/token, then retry only through the guarded Release workflow.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'vsix-package-invalid',
    patterns: [
      /vsix.*(invalid|corrupt|malformed)/i,
      /invalid.*vsix/i,
      /extension package.*invalid/i
    ],
    rootCause: 'The generated VSIX is invalid or cannot be consumed.',
    recommendedFix:
      'Regenerate the VSIX with pnpm run package, run package validation, and inspect package contents before any publish retry.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'vsix-contents-invalid',
    patterns: [
      /vsix.*(missing|unexpected).*contents/i,
      /missing.*runtime.*asset/i,
      /\.vscodeignore.*(excluded|missing|invalid)/i
    ],
    rootCause: 'The VSIX contents do not match the expected runtime package.',
    recommendedFix:
      'Fix .vscodeignore or packaging inputs, then run pnpm run package and pnpm run package:validate.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'release-tag-version-mismatch',
    patterns: [
      /release tag.*does not match/i,
      /tag.*version.*mismatch/i,
      /version.*does not match package\.json/i
    ],
    rootCause:
      'The release tag, release-please output, package.json, or pnpm lock state disagree.',
    recommendedFix:
      'Stop the release and align package.json, pnpm-lock.yaml, and the v-prefixed release tag before retrying.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'artifact-attestation-failed',
    patterns: [
      /attest.*(failed|error)/i,
      /artifact attestation/i,
      /attest-build-provenance/i
    ],
    rootCause: 'GitHub artifact attestation or provenance generation failed.',
    recommendedFix:
      'Verify id-token and attestations permissions, artifact paths, and rerun the guarded dry-run release before publishing.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'sbom-generation-failed',
    patterns: [/sbom.*(failed|error|missing)/i, /cyclonedx.*(failed|error)/i],
    rootCause: 'SBOM generation failed or the expected SBOM file is missing.',
    recommendedFix:
      'Run pnpm run release:assets locally, fix dependency/SBOM generation errors, and keep the SBOM artifact with the release assets.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'checksum-generation-failed',
    patterns: [
      /checksum.*(failed|error|missing)/i,
      /SHA256SUMS\.txt.*(failed|missing|not found)/i
    ],
    rootCause: 'Checksum generation failed or SHA256SUMS.txt is missing.',
    recommendedFix:
      'Run pnpm run release:assets locally and verify SHA256SUMS.txt covers the generated VSIX.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'marketplace-trusted-publisher-mismatch',
    patterns: [/trusted publisher/i, /publisher.*mismatch/i],
    rootCause:
      'Marketplace publisher identity, trusted publisher configuration, or token scope does not match the extension package.',
    recommendedFix:
      'Stop publishing, verify Visual Studio Marketplace publisher access, VSCE_PAT scope, and package publisher metadata in the release environment.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'vsce-package-error',
    patterns: [/\bvsce\b.*(error|failed|invalid)/i, /@vscode\/vsce/i],
    rootCause: 'VSIX packaging failed before marketplace upload.',
    recommendedFix:
      'Run pnpm run package and package validation locally, then fix manifest, .vscodeignore, or bundled runtime asset drift.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'ovsx-package-error',
    patterns: [/\bovsx\b.*(error|failed|invalid)/i, /open vsx/i],
    rootCause: 'Open VSX package or publish validation failed.',
    recommendedFix:
      'Run the safe Open VSX package check and verify namespace, README assets, and VSIX metadata before any publish retry.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'extension-manifest-invalid',
    patterns: [
      /extension manifest/i,
      /package\.json.*invalid/i,
      /engines\.vscode/i
    ],
    rootCause:
      'VS Code extension manifest metadata is invalid or inconsistent.',
    recommendedFix:
      'Validate package.json against VS Code manifest requirements and keep publisher, engines, activation, and runtime assets aligned.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'package-json-version-drift',
    patterns: [
      /pnpm lock.*version.*match/i,
      /version.*drift/i,
      /tag.*version/i
    ],
    rootCause:
      'package.json, pnpm-lock.yaml, or release tag versions disagree.',
    recommendedFix:
      'Update package.json and pnpm-lock.yaml together, or stop the release until the tag and package version agree.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'generated-assets-drift',
    patterns: [/generated.*drift/i, /bundle.*size/i, /asset.*drift/i],
    rootCause:
      'Generated assets or bundle-size metadata changed without committed output.',
    recommendedFix:
      'Regenerate the relevant asset through the repository script and commit matching source plus generated changes.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: false
  },
  {
    id: 'workflow-syntax',
    patterns: [/workflow.*syntax/i, /invalid workflow/i, /yaml/i],
    rootCause: 'GitHub Actions workflow YAML or expression syntax is invalid.',
    recommendedFix:
      'Run pnpm run workflows:lint, fix the workflow syntax, and keep permissions/concurrency explicit.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'actionlint',
    patterns: [/actionlint/i],
    rootCause:
      'actionlint reported invalid workflow syntax, context use, or action configuration.',
    recommendedFix:
      'Fix the reported workflow line and re-run pnpm run workflows:lint.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: true
  },
  {
    id: 'zizmor',
    patterns: [/zizmor/i],
    rootCause: 'zizmor reported a GitHub Actions security concern.',
    recommendedFix:
      'Apply the least-privilege workflow hardening or add a narrow documented exception only when justified.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'dependency-cache/restore issue',
    patterns: [
      /cache.*(restore|miss|fail)/i,
      /pnpm install --frozen-lockfile.*cache/i
    ],
    rootCause:
      'Dependency cache restore or cache service behavior failed independently from project correctness.',
    recommendedFix:
      'Retry the run if pnpm install --frozen-lockfile itself is clean; adjust cache keys only if the issue repeats.',
    autoFixAllowed: false,
    humanApprovalRequired: false,
    releasePublishMustStop: false
  },
  {
    id: 'CodeQL finding',
    patterns: [/codeql/i, /code scanning/i, /security-events/i],
    rootCause:
      'CodeQL analysis failed or produced a blocking code scanning finding.',
    recommendedFix:
      'Inspect the CodeQL alert and fix the source-to-sink issue; do not suppress without review.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'Gitleaks finding',
    patterns: [/gitleaks/i, /secret.*detected/i],
    rootCause:
      'Secret scanning detected a potential credential or high-risk token.',
    recommendedFix:
      'Stop release work, remove the secret from history if needed, rotate the credential, and add only safe allowlist rules.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'gitleaks-secret',
    patterns: [/gitleaks.*secret/i, /secret.*detected/i],
    rootCause:
      'Secret scanning detected a potential credential or high-risk token.',
    recommendedFix:
      'Stop release work, remove the secret from history if needed, rotate the credential, and add only safe allowlist rules.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'Trivy finding',
    patterns: [/trivy/i, /vulnerability/i],
    rootCause:
      'Trivy reported a dependency, filesystem, or configuration vulnerability.',
    recommendedFix:
      'Patch or justify the finding, then re-run the security scan before release work continues.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'test failure',
    patterns: [/jest/i, /test failed/i, /expected .* received/i, /pnpm test/i],
    rootCause: 'A unit, integration, or package smoke test failed.',
    recommendedFix:
      'Reproduce locally, fix the behavior or fixture expectation, and keep regression coverage focused.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: false
  },
  {
    id: 'typecheck failure',
    patterns: [/tsc/i, /typecheck/i, /typescript/i, /TS\d{4}/],
    rootCause: 'TypeScript type checking failed.',
    recommendedFix:
      'Fix the type error without weakening compiler settings or widening types unnecessarily.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: false
  },
  {
    id: 'lint failure',
    patterns: [/eslint/i, /prettier/i, /format:check/i, /lint/i],
    rootCause: 'Formatting or linting failed.',
    recommendedFix:
      'Apply the formatter or minimal lint fix, then re-run format:check and lint.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: false
  },
  {
    id: 'pnpm audit failure',
    patterns: [/pnpm audit/i, /audit.*high/i, /audit.*critical/i],
    rootCause: 'pnpm audit found a high or critical dependency vulnerability.',
    recommendedFix:
      'Upgrade the affected dependency through a controlled PR and run full extension packaging validation.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'dependency audit finding',
    patterns: [/dependency audit/i, /pnpm audit/i, /audit.*(high|critical)/i],
    rootCause: 'Dependency audit found a high or critical vulnerability.',
    recommendedFix:
      'Upgrade or mitigate the affected dependency in a controlled PR and run full extension packaging validation.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true
  },
  {
    id: 'package build failure',
    patterns: [
      /package build.*(failed|error)/i,
      /pnpm run package.*(failed|error)/i,
      /webpack.*(failed|error)/i
    ],
    rootCause: 'The extension build or VSIX package build failed.',
    recommendedFix:
      'Reproduce locally with pnpm run build and pnpm run package, then fix the exact source, asset, or bundling error.',
    autoFixAllowed: true,
    humanApprovalRequired: false,
    releasePublishMustStop: false
  },
  {
    id: 'personal-mirror-tag-clobber',
    patterns: [/divergent tag/i, /tag.*clobber/i, /clobber.*tag/i],
    rootCause:
      'A personal showcase tag differs from the canonical organization tag.',
    recommendedFix:
      'Do not overwrite automatically. Review the canonical and personal refs before any separate recovery.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: false
  },
  {
    id: 'personal-mirror-branch-divergence',
    patterns: [/branch.*divergen/i, /main.*divergen/i, /non-fast-forward/i],
    rootCause:
      'The personal showcase main branch diverged from canonical main.',
    recommendedFix:
      'Review the canonical and personal refs before any separate recovery.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: false
  },
  {
    id: 'flaky/infra failure',
    patterns: [/ECONNRESET/i, /ETIMEDOUT/i, /rate limit/i, /runner.*lost/i],
    rootCause:
      'The run likely failed because of infrastructure, network, or transient service behavior.',
    recommendedFix:
      'Rerun only the failed job if no source-level failure is present.',
    autoFixAllowed: false,
    humanApprovalRequired: false,
    releasePublishMustStop: false
  }
];

main();

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const input = readInput(options);
  const matches = classify(input);
  const summary = {
    classifications:
      matches.length > 0 ? matches : [unknownClassification(input.trim())],
    generatedAt: new Date().toISOString()
  };

  if (options.summaryFile) {
    fs.writeFileSync(
      options.summaryFile,
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8'
    );
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      formatMarkdown(summary),
      'utf8'
    );
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(formatText(summary));
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--text':
        options.text = requireValue(args, (index += 1), arg);
        break;
      case '--log-file':
        options.logFile = requireValue(args, (index += 1), arg);
        break;
      case '--summary-file':
        options.summaryFile = requireValue(args, (index += 1), arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/classify-gh-failure.mjs [options]

Options:
  --text value          Classify this text.
  --log-file path      Read workflow log text from a file.
  --json               Print machine-readable JSON.
  --summary-file path  Write JSON summary to the given path.
  --help               Show this help.

If neither --text nor --log-file is provided, stdin is read.`);
}

function readInput(options) {
  if (options.text) {
    return options.text;
  }
  if (options.logFile) {
    return fs.readFileSync(options.logFile, 'utf8');
  }
  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, 'utf8');
  }
  return '';
}

function classify(input) {
  return FAILURE_CLASSES.filter((item) =>
    item.patterns.some((pattern) => pattern.test(input))
  ).map((item) => ({
    class: item.id,
    rootCause: item.rootCause,
    recommendedFix: item.recommendedFix,
    autoFixAllowed: item.autoFixAllowed,
    humanApprovalRequired: item.humanApprovalRequired,
    releasePublishMustStop: item.releasePublishMustStop,
    auto_fix_allowed: item.autoFixAllowed,
    human_approval_required: item.humanApprovalRequired,
    publish_must_stop: item.releasePublishMustStop,
    confidence: confidenceFor(item, input)
  }));
}

function confidenceFor(item, input) {
  const hits = item.patterns.filter((pattern) => pattern.test(input)).length;
  return Number(Math.min(0.95, 0.55 + hits * 0.2).toFixed(2));
}

function unknownClassification(trimmedInput) {
  return {
    class: 'unknown',
    rootCause: trimmedInput
      ? 'The failure did not match a known repository class.'
      : 'No failure text was provided.',
    recommendedFix:
      'Inspect the failed job log, then update the classifier when a repeated class is identified.',
    autoFixAllowed: false,
    humanApprovalRequired: true,
    releasePublishMustStop: true,
    auto_fix_allowed: false,
    human_approval_required: true,
    publish_must_stop: true,
    confidence: 0.1
  };
}

function formatText(summary) {
  return summary.classifications
    .map((item) =>
      [
        `Class: ${item.class}`,
        `Root cause: ${item.rootCause}`,
        `Recommended fix: ${item.recommendedFix}`,
        `Auto-fix allowed: ${item.autoFixAllowed}`,
        `Human approval required: ${item.humanApprovalRequired}`,
        `Release/publish must stop: ${item.releasePublishMustStop}`,
        `Confidence: ${item.confidence}`
      ].join('\n')
    )
    .join('\n\n');
}

function formatMarkdown(summary) {
  const lines = [
    '## Failure Classifier',
    '',
    '| Class | Auto-fix | Human approval | Stop release/publish | Recommended fix |',
    '| --- | --- | --- | --- | --- |'
  ];

  for (const item of summary.classifications) {
    lines.push(
      `| ${item.class} | ${item.autoFixAllowed} | ${item.humanApprovalRequired} | ${item.releasePublishMustStop} | ${item.recommendedFix} |`
    );
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}
