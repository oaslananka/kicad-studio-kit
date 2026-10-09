export interface BoardReadyOpsEvidenceVerification {
  ok: boolean;
  manifestPath: string;
  checked: number;
  errors: string[];
  signature: {
    present: boolean;
    ok: boolean;
    errors: string[];
  };
}

const INVALID_CONTRACT =
  'BoardReadyOps release verification returned an invalid contract.';

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

export function parseBoardReadyOpsEvidenceVerification(
  stdout: string
): BoardReadyOpsEvidenceVerification {
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim());
  } catch {
    throw new Error(
      'BoardReadyOps release verification returned invalid JSON output.'
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(INVALID_CONTRACT);
  }
  const candidate = value as Record<string, unknown>;
  const signature = candidate['signature'];
  if (
    typeof candidate['ok'] !== 'boolean' ||
    typeof candidate['manifestPath'] !== 'string' ||
    !Number.isInteger(candidate['checked']) ||
    Number(candidate['checked']) < 0 ||
    !isStringArray(candidate['errors']) ||
    !signature ||
    typeof signature !== 'object' ||
    Array.isArray(signature)
  ) {
    throw new Error(INVALID_CONTRACT);
  }
  const signatureRecord = signature as Record<string, unknown>;
  if (
    typeof signatureRecord['present'] !== 'boolean' ||
    typeof signatureRecord['ok'] !== 'boolean' ||
    !isStringArray(signatureRecord['errors'])
  ) {
    throw new Error(INVALID_CONTRACT);
  }
  return value as BoardReadyOpsEvidenceVerification;
}

/**
 * The published BoardReadyOps release verify CLI exits 0 for a verified bundle
 * and 1 for an unverified bundle. A contradictory JSON response must not
 * authorize manufacturing release or be reported as verified in the UI.
 *
 * Upstream permits unsigned evidence when no signing key/trust store was
 * required: signature.present=false with signature.ok=true is still valid.
 */
export function assertBoardReadyOpsEvidenceVerdict(
  verification: BoardReadyOpsEvidenceVerification,
  processExitCode: number
): void {
  if (
    processExitCode !== (verification.ok ? 0 : 1) ||
    (verification.ok &&
      (verification.checked === 0 ||
        verification.errors.length > 0 ||
        !verification.signature.ok ||
        verification.signature.errors.length > 0))
  ) {
    // Do not echo upstream errors, bundle paths, or other untrusted CLI fields.
    throw new Error(
      'BoardReadyOps release verification returned inconsistent or incomplete evidence.'
    );
  }
}
