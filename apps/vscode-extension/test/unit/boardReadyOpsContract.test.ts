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
        ruleId: 'fab.test',
        severity: 'high' as const,
        message: 'Blocking fabrication issue',
        resource: { path: 'board.kicad_pcb', kind: 'pcb' }
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
