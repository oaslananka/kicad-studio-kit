import {
  assertBoardReadyOpsEvidenceVerdict,
  parseBoardReadyOpsEvidenceVerification
} from '../../src/boardreadyops/evidence';

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

describe('BoardReadyOps evidence verification process verdict', () => {
  it('accepts a passing signed bundle', () => {
    expect(() =>
      assertBoardReadyOpsEvidenceVerdict(validResult(), 0)
    ).not.toThrow();
  });

  it('accepts a passing unsigned bundle under the published CLI contract', () => {
    expect(() =>
      assertBoardReadyOpsEvidenceVerdict(
        {
          ...validResult(),
          signature: { present: false, ok: true, errors: [] }
        },
        0
      )
    ).not.toThrow();
  });

  it('accepts a failed verification with process exit 1', () => {
    expect(() =>
      assertBoardReadyOpsEvidenceVerdict(
        {
          ...validResult(),
          ok: false,
          errors: ['private failure']
        },
        1
      )
    ).not.toThrow();
  });

  it.each([
    ['process failure with forged success', { ...validResult() }, 1],
    ['process success with failed verdict', { ...validResult(), ok: false }, 0],
    [
      'successful verdict with artifact error',
      { ...validResult(), errors: ['private details'] },
      0
    ],
    [
      'successful verdict with signature error',
      {
        ...validResult(),
        signature: { present: true, ok: false, errors: ['private signature'] }
      },
      0
    ],
    [
      'successful verdict with signature errors hidden by ok',
      {
        ...validResult(),
        signature: { present: true, ok: true, errors: ['private signature'] }
      },
      0
    ],
    [
      'successful verdict without checked artifacts',
      {
        ...validResult(),
        checked: 0
      },
      0
    ]
  ])(
    'rejects %s without leaking CLI evidence fields',
    (_description, value, processExitCode) => {
      expect(() =>
        assertBoardReadyOpsEvidenceVerdict(value, processExitCode)
      ).toThrow(
        'BoardReadyOps release verification returned inconsistent or incomplete evidence.'
      );
      try {
        assertBoardReadyOpsEvidenceVerdict(value, processExitCode);
      } catch (error) {
        expect(String(error)).not.toContain('private');
      }
    }
  );
});
