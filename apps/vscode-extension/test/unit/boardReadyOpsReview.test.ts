import {
  parseBoardReadyOpsReviewPreview,
  supportsBoardReadyOpsReviewJson
} from '../../src/boardreadyops/review';

// Captured from published boardreadyops@1.70.0 on a test-only KiCad fixture.
const valid = {
  schemaVersion: 1,
  tool: { name: 'boardreadyops', version: '1.70.0' },
  success: true,
  dryRun: true,
  evidenceDigest:
    'b48dafa399c1f61ced62bfcd30bf976400abdaadeba9a08ce1b61d82de3af2e9'
};

describe('#623 BoardReadyOps published 1.70.0 review JSON capability boundary', () => {
  test.each([
    '1.2.0',
    '1.68.3',
    '1.69.0',
    '1.70.0-rc.1',
    '2.0.0',
    'not-a-version'
  ])('does not enable review JSON for unsupported %s', (version) =>
    expect(supportsBoardReadyOpsReviewJson(version)).toBe(false)
  );

  it('accepts only an actual supported, harmless JSON preview', () => {
    expect(supportsBoardReadyOpsReviewJson('1.70.0')).toBe(true);
    expect(
      parseBoardReadyOpsReviewPreview(JSON.stringify(valid), '1.70.0', 0)
    ).toEqual(valid);
  });

  test.each([
    ['published 1.68.3 human output', 'Analyzing board...\nDone.', '1.68.3', 0],
    ['text with compatible version', 'Analyzing board...\nDone.', '1.70.0', 0],
    [
      'unsupported schema',
      JSON.stringify({ ...valid, schemaVersion: 2 }),
      '1.70.0',
      0
    ],
    [
      'missing digest',
      JSON.stringify({ ...valid, evidenceDigest: undefined }),
      '1.70.0',
      0
    ],
    [
      'bad digest',
      JSON.stringify({ ...valid, evidenceDigest: 'fake' }),
      '1.70.0',
      0
    ],
    [
      'wrong tool',
      JSON.stringify({
        ...valid,
        tool: { name: 'unknown', version: '1.70.0' }
      }),
      '1.70.0',
      0
    ],
    ['version swap', JSON.stringify(valid), '1.70.1', 0],
    ['failed process', JSON.stringify(valid), '1.70.0', 1],
    ['not dry run', JSON.stringify({ ...valid, dryRun: false }), '1.70.0', 0],
    [
      'false success',
      JSON.stringify({ ...valid, success: false }),
      '1.70.0',
      0
    ],
    [
      'false published URL',
      JSON.stringify({ ...valid, reviewUrl: 'https://fake.invalid/review' }),
      '1.70.0',
      0
    ],
    ['false run ID', JSON.stringify({ ...valid, runId: 'fake' }), '1.70.0', 0],
    [
      'extra top-level source evidence',
      JSON.stringify({ ...valid, sourceEvidence: 'private source contents' }),
      '1.70.0',
      0
    ],
    [
      'extra top-level credential metadata',
      JSON.stringify({ ...valid, credentials: { apiToken: 'redacted' } }),
      '1.70.0',
      0
    ],
    [
      'extra tool metadata',
      JSON.stringify({
        ...valid,
        tool: { ...valid.tool, internalEndpoint: 'https://internal.invalid' }
      }),
      '1.70.0',
      0
    ],
    ['array', '[]', '1.70.0', 0],
    ['null', 'null', '1.70.0', 0]
  ] as const)('fails closed on %s', (_name, stdout, version, exit) =>
    expect(() =>
      parseBoardReadyOpsReviewPreview(stdout, version, exit)
    ).toThrow('supported structured review preview')
  );
});
