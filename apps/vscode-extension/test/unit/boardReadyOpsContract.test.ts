import { discoverBoardReadyOpsContract } from '../../src/boardreadyops/contract';

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
