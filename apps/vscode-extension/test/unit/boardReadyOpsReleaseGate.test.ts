import {
  evaluateBoardReadyOpsReleaseGate,
  verifyBoardReadyOpsManufacturingRelease
} from '../../src/boardreadyops/releaseGate';

const readiness = (patch: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  tool: { name: 'boardreadyops', version: '1.37.0' },
  status: 'passed',
  exitCode: 0,
  summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  findings: [],
  ...patch
});

const evidence = (patch: Record<string, unknown> = {}) => ({
  ok: true,
  manifestPath: '/private/release/manifest.json',
  checked: 3,
  errors: [],
  signature: { present: true, ok: true, errors: [] },
  ...patch
});

describe('BoardReadyOps manufacturing release gate', () => {
  it('accepts a passing readiness result with verified evidence', () => {
    expect(evaluateBoardReadyOpsReleaseGate(readiness(), evidence())).toEqual({
      ok: true,
      checkedArtifacts: 3,
      signatureVerified: true
    });
  });

  it('blocks on readiness blockers even when evidence is verified', () => {
    const result = readiness({
      status: 'failed',
      summary: { total: 1, critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      findings: [{ ruleId: 'manufacturing.blocker', severity: 'high' }]
    });
    expect(evaluateBoardReadyOpsReleaseGate(result, evidence())).toEqual({
      ok: false,
      reason: 'BoardReadyOps readiness has blocking findings.'
    });
  });

  it('blocks when release evidence is not verified', () => {
    expect(
      evaluateBoardReadyOpsReleaseGate(readiness(), evidence({ ok: false }))
    ).toEqual({
      ok: false,
      reason: 'BoardReadyOps release evidence is not verified.'
    });
  });

  it('stops before evidence verification when readiness is already blocked', async () => {
    const runner = jest
      .fn()
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          schemaVersion: 1,
          tool: { name: 'boardreadyops', version: '1.37.0' },
          checks: []
        }),
        stderr: '',
        exitCode: 0
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify(
          readiness({
            status: 'failed',
            summary: {
              total: 1,
              critical: 0,
              high: 1,
              medium: 0,
              low: 0,
              info: 0
            },
            findings: [
              {
                ruleId: 'manufacturing.blocker',
                severity: 'high',
                message: 'Blocked',
                resource: { path: 'board.kicad_pcb', kind: 'pcb' },
                fingerprint:
                  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
              }
            ]
          })
        ),
        stderr: '',
        exitCode: 1
      });

    await expect(
      verifyBoardReadyOpsManufacturingRelease('/project', undefined, runner)
    ).resolves.toEqual({
      ok: false,
      reason: 'BoardReadyOps readiness has blocking findings.'
    });
    expect(runner).toHaveBeenCalledTimes(2);
  });
});
