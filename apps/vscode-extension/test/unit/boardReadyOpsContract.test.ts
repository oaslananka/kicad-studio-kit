import {
  discoverBoardReadyOpsContract,
  parseBoardReadyOpsRunResult
} from '../../src/boardreadyops/contract';

describe('BoardReadyOps contract discovery', () => {
  it('accepts the supported versioned doctor contract', () => {
    expect(
      discoverBoardReadyOpsContract({
        schemaVersion: 1,
        tool: { name: 'boardreadyops', version: '1.37.0' },
        checks: []
      })
    ).toEqual({
      compatible: true,
      schemaVersion: 1,
      version: '1.37.0'
    });
  });

  it('accepts raw doctor JSON without duplicating parsing at call sites', () => {
    expect(
      discoverBoardReadyOpsContract(
        JSON.stringify({
          schemaVersion: 1,
          tool: { name: 'boardreadyops', version: '1.37.0' },
          checks: []
        })
      )
    ).toEqual({
      compatible: true,
      schemaVersion: 1,
      version: '1.37.0'
    });
  });

  it('fails closed when doctor output identifies a different tool', () => {
    expect(
      discoverBoardReadyOpsContract({
        schemaVersion: 1,
        tool: { name: 'other-tool', version: '1.37.0' },
        checks: []
      })
    ).toEqual({
      compatible: false,
      reason: 'malformed doctor payload',
      schemaVersion: 1,
      version: '1.37.0'
    });
  });

  it('fails closed when the doctor schema is malformed', () => {
    expect(
      discoverBoardReadyOpsContract({
        tool: { name: 'boardreadyops', version: '1.37.0' }
      })
    ).toEqual({
      compatible: false,
      reason: 'unsupported doctor schema',
      schemaVersion: undefined,
      version: '1.37.0'
    });
  });

  it('fails closed when the doctor payload is partial', () => {
    expect(
      discoverBoardReadyOpsContract({
        schemaVersion: 1,
        tool: { name: 'boardreadyops', version: '1.37.0' }
      })
    ).toEqual({
      compatible: false,
      reason: 'malformed doctor payload',
      schemaVersion: 1,
      version: '1.37.0'
    });
  });

  it('fails closed for prerelease doctor versions', () => {
    expect(
      discoverBoardReadyOpsContract({
        schemaVersion: 1,
        tool: { name: 'boardreadyops', version: '1.37.0-rc.1' },
        checks: []
      })
    ).toEqual({
      compatible: false,
      reason: 'unsupported BoardReadyOps version',
      schemaVersion: 1,
      version: '1.37.0-rc.1'
    });
  });

  it('fails closed when the BoardReadyOps version is outside the supported range', () => {
    expect(
      discoverBoardReadyOpsContract({
        schemaVersion: 1,
        tool: { name: 'boardreadyops', version: '2.0.0' },
        checks: []
      })
    ).toEqual({
      compatible: false,
      reason: 'unsupported BoardReadyOps version',
      schemaVersion: 1,
      version: '2.0.0'
    });
  });
});

describe('BoardReadyOps readiness result contract', () => {
  const supportedResult = {
    schemaVersion: 1,
    tool: { name: 'boardreadyops', version: '1.37.0' },
    status: 'failed' as const,
    exitCode: 2,
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
        ruleId: 'manufacturing.outputs-present',
        severity: 'high' as const,
        message: 'Blocking fabrication issue',
        resource: { path: 'board.kicad_pcb', kind: 'pcb' },
        fingerprint: 'a'.repeat(64)
      }
    ]
  };

  it('accepts the supported findings schema', () => {
    expect(
      parseBoardReadyOpsRunResult(JSON.stringify(supportedResult))
    ).toEqual(supportedResult);
  });

  it('fails closed when findings payload is partial', () => {
    expect(() =>
      parseBoardReadyOpsRunResult(
        JSON.stringify({
          schemaVersion: 1,
          tool: { name: 'boardreadyops', version: '1.37.0' },
          status: 'failed',
          summary: supportedResult.summary
        })
      )
    ).toThrow(
      'BoardReadyOps returned an unsupported or incomplete readiness result.'
    );
  });

  it('accepts valid line and region finding locations', () => {
    const withLocation = {
      ...supportedResult,
      findings: [
        {
          ...supportedResult.findings[0],
          location: {
            line: 1,
            column: 2,
            region: {
              startLine: 1,
              endLine: 2,
              startColumn: 1,
              endColumn: 4
            }
          }
        }
      ]
    };

    expect(parseBoardReadyOpsRunResult(JSON.stringify(withLocation))).toEqual(
      withLocation
    );
  });

  it('accepts board-coordinate-only finding locations from the published core contract', () => {
    const withBoardCoordinates = {
      ...supportedResult,
      findings: [
        {
          ...supportedResult.findings[0],
          location: { boardCoordinates: { x: 10.5, y: 20.25, units: 'mm' } }
        }
      ]
    };

    expect(
      parseBoardReadyOpsRunResult(JSON.stringify(withBoardCoordinates))
    ).toEqual(withBoardCoordinates);
  });

  it.each([
    [
      'unknown resource kind',
      { resource: { path: 'board.kicad_pcb', kind: 'unknown' } }
    ],
    ['missing fingerprint', { fingerprint: undefined }],
    ['malformed fingerprint', { fingerprint: 'not-a-sha256' }]
  ])('fails closed when a finding has %s', (_name, patch) => {
    const finding = { ...supportedResult.findings[0], ...patch };
    if ('fingerprint' in patch && patch.fingerprint === undefined)
      delete (finding as { fingerprint?: string }).fingerprint;

    expect(() =>
      parseBoardReadyOpsRunResult(
        JSON.stringify({ ...supportedResult, findings: [finding] })
      )
    ).toThrow(
      'BoardReadyOps returned an unsupported or incomplete readiness result.'
    );
  });

  it('fails closed when a finding contains malformed location data', () => {
    const malformed = {
      ...supportedResult,
      findings: [
        {
          ...supportedResult.findings[0],
          location: { region: { startLine: 1, endLine: '2' } }
        }
      ]
    };

    expect(() =>
      parseBoardReadyOpsRunResult(JSON.stringify(malformed))
    ).toThrow(
      'BoardReadyOps returned an unsupported or incomplete readiness result.'
    );
  });

  it.each([
    ['invalid JSON', 'PRIVATE_READINESS_SENTINEL'],
    ['null payload', JSON.stringify(null)],
    ['array payload', JSON.stringify([])]
  ])('fails closed for %s', (_name, payload) => {
    expect(() => parseBoardReadyOpsRunResult(payload)).toThrow();
  });

  it.each([
    ['tool object', { tool: null }],
    ['tool name', { tool: { name: 'other', version: '1.37.0' } }],
    ['tool version type', { tool: { name: 'boardreadyops', version: 137 } }],
    [
      'tool semantic version',
      { tool: { name: 'boardreadyops', version: 'invalid' } }
    ],
    [
      'tool supported range',
      { tool: { name: 'boardreadyops', version: '2.0.0' } }
    ],
    ['summary object', { summary: null }],
    ['summary total', { summary: { ...supportedResult.summary, total: -1 } }],
    [
      'summary critical',
      { summary: { ...supportedResult.summary, critical: -1 } }
    ],
    ['summary high', { summary: { ...supportedResult.summary, high: -1 } }],
    ['summary medium', { summary: { ...supportedResult.summary, medium: -1 } }],
    ['summary low', { summary: { ...supportedResult.summary, low: -1 } }],
    ['summary info', { summary: { ...supportedResult.summary, info: -1 } }],
    ['findings array', { findings: null }],
    ['status', { status: 'unknown' }],
    ['exit code', { exitCode: -1 }]
  ])('fails closed when readiness has invalid %s', (_name, patch) => {
    expect(() =>
      parseBoardReadyOpsRunResult(
        JSON.stringify({ ...supportedResult, ...patch })
      )
    ).toThrow(
      'BoardReadyOps returned an unsupported or incomplete readiness result.'
    );
  });

  it.each([
    ['non-object finding', null],
    ['non-object resource', { ...supportedResult.findings[0], resource: null }],
    ['invalid rule id', { ...supportedResult.findings[0], ruleId: '' }],
    [
      'invalid severity',
      { ...supportedResult.findings[0], severity: 'unknown' }
    ],
    ['invalid message type', { ...supportedResult.findings[0], message: 42 }],
    [
      'invalid path type',
      { ...supportedResult.findings[0], resource: { path: 42, kind: 'pcb' } }
    ],
    [
      'invalid location object',
      { ...supportedResult.findings[0], location: null }
    ],
    [
      'invalid region object',
      { ...supportedResult.findings[0], location: { region: null } }
    ],
    [
      'invalid region start line',
      {
        ...supportedResult.findings[0],
        location: { region: { startLine: 0, endLine: 2 } }
      }
    ],
    [
      'invalid region end line',
      {
        ...supportedResult.findings[0],
        location: { region: { startLine: 1, endLine: 0 } }
      }
    ],
    [
      'invalid region start column',
      {
        ...supportedResult.findings[0],
        location: { region: { startLine: 1, endLine: 2, startColumn: 0 } }
      }
    ],
    [
      'invalid region end column',
      {
        ...supportedResult.findings[0],
        location: { region: { startLine: 1, endLine: 2, endColumn: 0 } }
      }
    ],
    ['invalid line', { ...supportedResult.findings[0], location: { line: 0 } }],
    [
      'invalid column',
      { ...supportedResult.findings[0], location: { line: 1, column: 0 } }
    ],
    [
      'invalid board coordinates object',
      { ...supportedResult.findings[0], location: { boardCoordinates: null } }
    ],
    [
      'invalid board x type',
      {
        ...supportedResult.findings[0],
        location: { boardCoordinates: { x: '1', y: 2, units: 'mm' } }
      }
    ],
    [
      'invalid board x finite value',
      {
        ...supportedResult.findings[0],
        location: { boardCoordinates: { x: null, y: 2, units: 'mm' } }
      }
    ],
    [
      'invalid board y type',
      {
        ...supportedResult.findings[0],
        location: { boardCoordinates: { x: 1, y: '2', units: 'mm' } }
      }
    ],
    [
      'invalid board layer',
      {
        ...supportedResult.findings[0],
        location: { boardCoordinates: { x: 1, y: 2, layer: 42, units: 'mm' } }
      }
    ],
    [
      'invalid board units',
      {
        ...supportedResult.findings[0],
        location: { boardCoordinates: { x: 1, y: 2, units: 'cm' } }
      }
    ]
  ])('fails closed for %s', (_name, finding) => {
    expect(() =>
      parseBoardReadyOpsRunResult(
        JSON.stringify({ ...supportedResult, findings: [finding] })
      )
    ).toThrow(
      'BoardReadyOps returned an unsupported or incomplete readiness result.'
    );
  });

  it('accepts optional empty finding message and resource path allowed by findings schema v1', () => {
    const finding = {
      ...supportedResult.findings[0],
      message: '',
      resource: { path: '', kind: 'pcb' }
    };
    expect(
      parseBoardReadyOpsRunResult(
        JSON.stringify({ ...supportedResult, findings: [finding] })
      ).findings[0]
    ).toEqual(finding);
  });

  it('fails closed when findings payload uses an unsupported schema', () => {
    expect(() =>
      parseBoardReadyOpsRunResult(
        JSON.stringify({ ...supportedResult, schemaVersion: 2 })
      )
    ).toThrow(
      'BoardReadyOps returned an unsupported or incomplete readiness result.'
    );
  });
});
