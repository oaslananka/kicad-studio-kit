import * as path from 'node:path';
import {
  discoverBoardReadyOpsContract,
  parseBoardReadyOpsRunResult
} from './contract';
import { parseBoardReadyOpsEvidenceVerification } from './evidence';
import {
  runBoardReadyOpsCommand,
  type BoardReadyOpsCommandResult
} from './cli';

export type BoardReadyOpsReleaseGateDecision =
  | {
      ok: true;
      checkedArtifacts: number;
      signatureVerified: boolean;
    }
  | {
      ok: false;
      reason: string;
    };

type BoardReadyOpsRunner = (
  projectPath: string,
  args: string[]
) => Promise<BoardReadyOpsCommandResult>;

function hasBlockingReadiness(readiness: {
  status?: string;
  findings: Array<{ severity: string }>;
}): boolean {
  return (
    readiness.status !== 'passed' ||
    readiness.findings.some(
      (finding) =>
        finding.severity === 'critical' || finding.severity === 'high'
    )
  );
}

export function evaluateBoardReadyOpsReleaseGate(
  readiness: { status?: string; findings: Array<{ severity: string }> },
  evidence: {
    ok: boolean;
    checked: number;
    signature: { present: boolean; ok: boolean };
  }
): BoardReadyOpsReleaseGateDecision {
  if (hasBlockingReadiness(readiness)) {
    return {
      ok: false,
      reason: 'BoardReadyOps readiness has blocking findings.'
    };
  }

  if (!evidence.ok) {
    return {
      ok: false,
      reason: 'BoardReadyOps release evidence is not verified.'
    };
  }

  return {
    ok: true,
    checkedArtifacts: evidence.checked,
    signatureVerified: evidence.signature.present && evidence.signature.ok
  };
}

export async function verifyBoardReadyOpsManufacturingRelease(
  projectPath: string,
  specFile?: string,
  runner: BoardReadyOpsRunner = runBoardReadyOpsCommand
): Promise<BoardReadyOpsReleaseGateDecision> {
  const doctor = await runner(projectPath, ['doctor', '--format', 'json']);
  if (doctor.exitCode !== 0) {
    throw new Error(
      `BoardReadyOps doctor exited with code ${doctor.exitCode}.`
    );
  }
  const contract = discoverBoardReadyOpsContract(doctor.stdout);
  if (!contract.compatible) {
    throw new Error(
      `BoardReadyOps is not contract-compatible: ${contract.reason} (version ${contract.version}, doctor schema ${contract.schemaVersion ?? 'missing'}).`
    );
  }

  const runArgs = ['run', '--format', 'json'];
  if (specFile) runArgs.push('--config', specFile);
  runArgs.push(projectPath);
  const readinessProcess = await runner(projectPath, runArgs);
  if (readinessProcess.exitCode !== 0 && readinessProcess.exitCode !== 1) {
    throw new Error(
      `BoardReadyOps run exited with code ${readinessProcess.exitCode}.`
    );
  }
  const readiness = parseBoardReadyOpsRunResult(readinessProcess.stdout);
  if (hasBlockingReadiness(readiness)) {
    return {
      ok: false,
      reason: 'BoardReadyOps readiness has blocking findings.'
    };
  }

  const evidenceProcess = await runner(projectPath, [
    'release',
    'verify',
    '--format',
    'json',
    path.join(projectPath, 'build', 'boardreadyops-release')
  ]);
  if (evidenceProcess.exitCode !== 0 && evidenceProcess.exitCode !== 1) {
    throw new Error(
      `BoardReadyOps release verify exited with code ${evidenceProcess.exitCode}.`
    );
  }
  const evidence = parseBoardReadyOpsEvidenceVerification(
    evidenceProcess.stdout
  );
  return evaluateBoardReadyOpsReleaseGate(readiness, evidence);
}
