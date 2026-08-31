import { parseBoardReadyOpsPlan } from '../../src/boardreadyops/plan';

function validPlan(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    tool: { name: 'boardreadyops', version: '1.37.0' },
    generatedAt: '2026-08-31T00:00:00.000Z',
    status: 'failed',
    exitCode: 1,
    summary: {
      total: 1,
      critical: 0,
      high: 1,
      medium: 0,
      low: 0,
      info: 0,
      maxSeverity: 'high',
      failed: true
    },
    projectRoot: '/project',
    nextActions: [
      {
        id: 'finding-1',
        ruleId: 'manufacturing.outputs-present',
        severity: 'high',
        title: 'Generate missing manufacturing outputs.',
        resource: { path: 'board.kicad_pcb', kind: 'pcb' },
        evidence: { message: 'Manufacturing outputs are missing.' },
        whyItMatters: 'Fabrication requires current outputs.',
        fixStrategy: {
          description: 'Generate current outputs.',
          steps: ['Run the KiCad jobset.', 'Re-run BoardReadyOps.']
        },
        safeAutoFixPossible: false,
        commandsToVerify: [
          'boardreadyops check --rule manufacturing.outputs-present /project'
        ]
      }
    ],
    releaseActions: []
  };
}

describe('BoardReadyOps agent plan contract', () => {
  it('accepts the published agent-plan v1 shape', () => {
    const parsed = parseBoardReadyOpsPlan(JSON.stringify(validPlan()));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.nextActions[0]?.id).toBe('finding-1');
  });

  it('rejects malformed JSON without echoing the payload', () => {
    expect(() => parseBoardReadyOpsPlan('PRIVATE_PLAN_SENTINEL')).toThrow(
      'BoardReadyOps plan returned invalid JSON output.'
    );
  });

  it.each([
    [
      'schema version',
      (plan: Record<string, unknown>) => (plan['schemaVersion'] = 2)
    ],
    [
      'tool name',
      (plan: Record<string, unknown>) =>
        (plan['tool'] = { name: 'other', version: '1.37.0' })
    ],
    [
      'generated timestamp',
      (plan: Record<string, unknown>) => (plan['generatedAt'] = '')
    ],
    ['status', (plan: Record<string, unknown>) => (plan['status'] = 'unknown')],
    ['exit code', (plan: Record<string, unknown>) => (plan['exitCode'] = '1')],
    [
      'project root',
      (plan: Record<string, unknown>) => (plan['projectRoot'] = '')
    ],
    [
      'summary',
      (plan: Record<string, unknown>) => (plan['summary'] = { total: -1 })
    ],
    [
      'next actions',
      (plan: Record<string, unknown>) => (plan['nextActions'] = 'invalid')
    ],
    [
      'release actions',
      (plan: Record<string, unknown>) => (plan['releaseActions'] = 'invalid')
    ]
  ])('fails closed on an invalid %s', (_name, mutate) => {
    const plan = validPlan();
    mutate(plan);
    expect(() => parseBoardReadyOpsPlan(JSON.stringify(plan))).toThrow(
      'BoardReadyOps plan returned an invalid contract.'
    );
  });

  it.each([
    ['id', ''],
    ['ruleId', ''],
    ['severity', 'unknown'],
    ['title', ''],
    ['resource', null],
    ['evidence', null],
    ['whyItMatters', ''],
    ['fixStrategy', null],
    ['safeAutoFixPossible', 'false'],
    ['commandsToVerify', []]
  ])('fails closed when an action has invalid %s', (field, value) => {
    const plan = validPlan();
    const action = (plan['nextActions'] as Array<Record<string, unknown>>)[0];
    expect(action).toBeDefined();
    action![field] = value;
    expect(() => parseBoardReadyOpsPlan(JSON.stringify(plan))).toThrow(
      'BoardReadyOps plan returned an invalid contract.'
    );
  });
});
