import { parseBoardReadyOpsEvidenceVerification } from '../../src/boardreadyops/evidence';

const validResult = () => ({
  ok: true,
  manifestPath: '/private/workspace/build/boardreadyops-release/manifest.json',
  checked: 3,
  errors: [],
  signature: { present: true, ok: true, errors: [] }
});

describe('BoardReadyOps release evidence verification contract', () => {
  it('accepts the published release verify JSON shape', () => {
    expect(
      parseBoardReadyOpsEvidenceVerification(JSON.stringify(validResult()))
    ).toEqual(validResult());
  });

  it.each([
    ['ok', { ok: 'yes' }],
    ['checked', { checked: -1 }],
    ['errors', { errors: 'private' }],
    ['signature', { signature: null }],
    [
      'signature present',
      { signature: { present: 'yes', ok: true, errors: [] } }
    ],
    ['signature ok', { signature: { present: true, ok: 'yes', errors: [] } }],
    [
      'signature errors',
      { signature: { present: true, ok: true, errors: [42] } }
    ]
  ])('fails closed for invalid %s', (_name, patch) => {
    expect(() =>
      parseBoardReadyOpsEvidenceVerification(
        JSON.stringify({ ...validResult(), ...patch })
      )
    ).toThrow(
      'BoardReadyOps release verification returned an invalid contract.'
    );
  });

  it('rejects malformed JSON without echoing private output', () => {
    expect(() =>
      parseBoardReadyOpsEvidenceVerification('PRIVATE_EVIDENCE_SENTINEL')
    ).toThrow(
      'BoardReadyOps release verification returned invalid JSON output.'
    );
    try {
      parseBoardReadyOpsEvidenceVerification('PRIVATE_EVIDENCE_SENTINEL');
    } catch (error) {
      expect(String(error)).not.toContain('PRIVATE_EVIDENCE_SENTINEL');
    }
  });
});
