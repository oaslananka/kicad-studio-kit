import semver from 'semver';

/**
 * Review JSON is a staged upstream interface and is not emitted by published
 * BoardReadyOps 1.68.3. Never infer this capability from generic doctor schema
 * compatibility alone; verify a supported CLI version AND its actual output.
 */
export const BOARDREADYOPS_REVIEW_JSON_MIN_VERSION = '1.69.0';

export interface BoardReadyOpsReviewPreview {
  schemaVersion: 1;
  tool: { name: 'boardreadyops'; version: string };
  success: true;
  dryRun: true;
  evidenceDigest: string;
}

const INVALID_REVIEW_CONTRACT =
  'BoardReadyOps did not return a supported structured review preview.';

export function supportsBoardReadyOpsReviewJson(version: string): boolean {
  const valid = semver.valid(version);
  return Boolean(
    valid &&
    semver.satisfies(valid, `>=${BOARDREADYOPS_REVIEW_JSON_MIN_VERSION} <2.0.0`)
  );
}

/** No review URL/ID is ever accepted from a dry-run as proof of publication. */
export function parseBoardReadyOpsReviewPreview(
  stdout: string,
  discoveredVersion: string,
  exitCode: number
): BoardReadyOpsReviewPreview {
  if (!supportsBoardReadyOpsReviewJson(discoveredVersion) || exitCode !== 0) {
    throw new Error(INVALID_REVIEW_CONTRACT);
  }
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim());
  } catch {
    throw new Error(INVALID_REVIEW_CONTRACT);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(INVALID_REVIEW_CONTRACT);
  }
  const result = value as Record<string, unknown>;
  const tool = result['tool'];
  const item =
    tool && typeof tool === 'object' && !Array.isArray(tool)
      ? (tool as Record<string, unknown>)
      : {};
  if (
    result['schemaVersion'] !== 1 ||
    item['name'] !== 'boardreadyops' ||
    item['version'] !== discoveredVersion ||
    result['success'] !== true ||
    result['dryRun'] !== true ||
    result['reviewUrl'] !== undefined ||
    result['runId'] !== undefined ||
    typeof result['evidenceDigest'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(result['evidenceDigest'])
  ) {
    throw new Error(INVALID_REVIEW_CONTRACT);
  }
  return result as unknown as BoardReadyOpsReviewPreview;
}
