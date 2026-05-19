#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

const DEFAULT_MAX_THREADS = 100;
const ACTIONABLE_PHRASES = [
  'bug:',
  'potential issue:',
  'suggested fix',
  'consider adding',
  'consider using',
  'could lead to',
  'can lead to',
  'will miss',
  'too broad',
  'safer',
  'exception',
  'security',
  'vulnerability',
  'correctness',
  'release',
  'publish',
  'workflow',
  'secret',
  'token',
  'unsafe',
  'marketplace',
  'vsce',
  'ovsx',
  'extension',
  'package',
  'artifact',
  'attestation'
];

const INFO_PATTERNS = [
  /^\s*(nit|note|fyi|info|informational)\b/i,
  /^\s*(looks good|thanks|thank you|resolved|acknowledged)\b/i
];

const BOT_NAME_PATTERNS = [
  /\[bot\]$/i,
  /-bot$/i,
  /github-actions/i,
  /dependabot/i,
  /renovate/i,
  /socket/i,
  /sentry/i,
  /gemini/i
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.repo || !options.pr) {
    throw new Error('Both --repo owner/name and --pr number are required.');
  }

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN is required for GitHub GraphQL.');
  }

  const maxThreads = clampNumber(
    Number(options.maxThreads ?? DEFAULT_MAX_THREADS),
    1,
    100
  );
  const [owner, name] = parseRepo(options.repo);
  const prNumber = Number.parseInt(options.pr, 10);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error('--pr must be a positive integer.');
  }

  const pullRequest = await fetchReviewThreads({
    token,
    owner,
    name,
    prNumber,
    maxThreads
  });
  const summary = summarizeReviewThreads({
    repo: options.repo,
    prNumber,
    pullRequest,
    maxThreads
  });

  if (options.summaryFile) {
    fs.writeFileSync(
      options.summaryFile,
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8'
    );
  }

  writeStepSummary(summary);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(formatConsoleSummary(summary));
  }

  if (options.failOnActionable && summary.actionableThreads.length > 0) {
    process.exitCode = 1;
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
      case '--repo':
        options.repo = requireValue(args, (index += 1), arg);
        break;
      case '--pr':
        options.pr = requireValue(args, (index += 1), arg);
        break;
      case '--json':
        options.json = true;
        break;
      case '--fail-on-actionable':
        options.failOnActionable = true;
        break;
      case '--summary-file':
        options.summaryFile = requireValue(args, (index += 1), arg);
        break;
      case '--max-threads':
        options.maxThreads = requireValue(args, (index += 1), arg);
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
  console.log(`Usage: node scripts/check-review-threads.mjs --repo owner/name --pr number [options]

Options:
  --json                  Print machine-readable JSON.
  --fail-on-actionable    Exit non-zero when actionable unresolved threads exist.
  --summary-file path     Write review-thread-summary.json to the given path.
  --max-threads number    Number of review threads to inspect, default 100, max 100.
  --help                  Show this help.

Environment:
  GH_TOKEN or GITHUB_TOKEN must have pull request read access.`);
}

function parseRepo(repo) {
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('--repo must use owner/name format.');
  }
  return parts;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_THREADS;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

async function fetchReviewThreads({
  token,
  owner,
  name,
  prNumber,
  maxThreads
}) {
  const query = `
    query ReviewThreadGate($owner: String!, $name: String!, $number: Int!, $first: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          id
          number
          url
          isDraft
          reviewThreads(first: $first) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              isResolved
              isOutdated
              path
              line
              originalLine
              diffSide
              comments(first: 100) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  author {
                    login
                  }
                  body
                  url
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }
      }
    }
  `;
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'kicad-studio-review-thread-gate'
    },
    body: JSON.stringify({
      query,
      variables: {
        owner,
        name,
        number: prNumber,
        first: maxThreads
      }
    })
  });

  const rawPayload = await response.text();
  let payload;
  try {
    payload = rawPayload ? JSON.parse(rawPayload) : {};
  } catch {
    const details = `${response.status} ${response.statusText}: ${rawPayload.slice(0, 300)}`;
    throw new Error(
      `GitHub GraphQL review-thread query returned non-JSON response: ${details}`
    );
  }

  if (!response.ok || payload.errors) {
    const details = payload.errors
      ? payload.errors.map((error) => error.message).join('; ')
      : `${response.status} ${response.statusText}: ${rawPayload.slice(0, 300)}`;
    throw new Error(`GitHub GraphQL review-thread query failed: ${details}`);
  }

  const pullRequest = payload.data?.repository?.pullRequest;
  if (!pullRequest) {
    throw new Error(`Pull request #${prNumber} was not found.`);
  }
  return pullRequest;
}

function summarizeReviewThreads({ repo, prNumber, pullRequest, maxThreads }) {
  const threads = (pullRequest.reviewThreads?.nodes ?? []).map((thread) =>
    classifyThread(thread)
  );
  const actionableThreads = threads.filter((thread) => thread.actionable);

  return {
    repo,
    pr: prNumber,
    url: pullRequest.url,
    isDraft: pullRequest.isDraft,
    inspectedThreadLimit: maxThreads,
    inspectedThreads: threads.length,
    threadPageInfo: pullRequest.reviewThreads?.pageInfo ?? null,
    actionableCount: actionableThreads.length,
    ignoredCount: threads.length - actionableThreads.length,
    actionableThreads,
    ignoredThreads: threads.filter((thread) => !thread.actionable),
    generatedAt: new Date().toISOString()
  };
}

function classifyThread(thread) {
  const commentsTruncated = Boolean(thread.comments?.pageInfo?.hasNextPage);
  const comments = (thread.comments?.nodes ?? []).map((comment) => ({
    author: comment.author?.login ?? 'unknown',
    body: redact(comment.body ?? ''),
    url: comment.url,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    isBot: isBotLogin(comment.author?.login ?? 'unknown')
  }));
  const rawBodies =
    thread.comments?.nodes?.map((comment) => comment.body ?? '') ?? [];
  const hasHumanComment = comments.some((comment) => !comment.isBot);
  const actionableBotComment = rawBodies.some((body) =>
    hasActionablePhrase(body)
  );

  let actionable = false;
  let reason = 'ignored';
  if (thread.isResolved) {
    reason = 'resolved';
  } else if (thread.isOutdated) {
    reason = 'outdated';
  } else if (hasHumanComment) {
    actionable = true;
    reason = 'unresolved-human-thread';
  } else if (commentsTruncated) {
    actionable = true;
    reason = 'unresolved-thread-comments-truncated';
  } else if (actionableBotComment) {
    actionable = true;
    reason = 'unresolved-actionable-bot-thread';
  } else {
    reason = rawBodies.every((body) => isInformational(body))
      ? 'informational-bot-thread'
      : 'non-actionable-bot-thread';
  }

  return {
    id: thread.id,
    actionable,
    reason,
    isResolved: thread.isResolved,
    isOutdated: thread.isOutdated,
    path: thread.path,
    line: thread.line,
    originalLine: thread.originalLine,
    diffSide: thread.diffSide,
    commentsTruncated,
    comments
  };
}

function isBotLogin(login) {
  return BOT_NAME_PATTERNS.some((pattern) => pattern.test(login));
}

function hasActionablePhrase(body) {
  const normalized = body.toLowerCase();
  return ACTIONABLE_PHRASES.some((phrase) => normalized.includes(phrase));
}

function isInformational(body) {
  if (!body.trim()) {
    return true;
  }
  return (
    INFO_PATTERNS.some((pattern) => pattern.test(body)) ||
    !hasActionablePhrase(body)
  );
}

function redact(value) {
  return value
    .replace(
      /(authorization|cookie|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi,
      '$1=[REDACTED]'
    )
    .replace(
      /(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g,
      '[REDACTED_GITHUB_TOKEN]'
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 1000);
}

function writeStepSummary(summary) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  fs.appendFileSync(summaryPath, formatMarkdownSummary(summary), 'utf8');
}

function formatConsoleSummary(summary) {
  return [
    `Review-thread gate for ${summary.repo}#${summary.pr}`,
    `PR: ${summary.url}`,
    `Inspected threads: ${summary.inspectedThreads}`,
    `Actionable unresolved threads: ${summary.actionableCount}`
  ].join('\n');
}

function formatMarkdownSummary(summary) {
  const lines = [
    '## Review Thread Gate',
    '',
    `- PR: ${summary.url}`,
    `- Draft: ${summary.isDraft ? 'yes' : 'no'}`,
    `- Threads inspected: ${summary.inspectedThreads}`,
    `- Actionable unresolved threads: ${summary.actionableCount}`,
    ''
  ];

  if (summary.actionableThreads.length > 0) {
    lines.push('| Path | Line | Reason | Latest comment |');
    lines.push('| --- | ---: | --- | --- |');
    for (const thread of summary.actionableThreads) {
      const latest = thread.comments.at(-1);
      const latestText = latest
        ? latest.body.replace(/\r?\n/g, ' ').slice(0, 160)
        : '';
      lines.push(
        `| ${thread.path} | ${thread.line ?? thread.originalLine ?? ''} | ${thread.reason} | ${latestText} |`
      );
    }
  } else {
    lines.push('No actionable unresolved review threads were found.');
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}
