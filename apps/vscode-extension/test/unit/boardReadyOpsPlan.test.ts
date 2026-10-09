import {
  assertBoardReadyOpsPlanVerdict,
  parseBoardReadyOpsPlan
} from '../../src/boardreadyops/plan';
import { boardReadyOpsAgentPlan } from './boardReadyOpsFixtures';

describe('BoardReadyOps agent plan contract', () => {
  it('accepts the published agent-plan v1 shape', () => {
    const parsed = parseBoardReadyOpsPlan(
      JSON.stringify(boardReadyOpsAgentPlan())
    );
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.nextActions[0]?.id).toBe('finding-1');
  });

  it.each([null, [], 42, 'text'])(
    'rejects non-object plan payloads',
    (payload) => {
      expect(() => parseBoardReadyOpsPlan(JSON.stringify(payload))).toThrow(
        'BoardReadyOps plan returned an invalid contract.'
      );
    }
  );

  it('rejects malformed JSON without echoing the payload', () => {
    expect(() => parseBoardReadyOpsPlan('PRIVATE_PLAN_SENTINEL')).toThrow(
      'BoardReadyOps plan returned invalid JSON output.'
    );
  });

  it('rejects non-object actions in the plan', () => {
    const plan = boardReadyOpsAgentPlan();
    plan['nextActions'] = [null];

    expect(() => parseBoardReadyOpsPlan(JSON.stringify(plan))).toThrow(
      'BoardReadyOps plan returned an invalid contract.'
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
    const plan = boardReadyOpsAgentPlan();
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
    const plan = boardReadyOpsAgentPlan();
    const action = (plan['nextActions'] as Array<Record<string, unknown>>)[0];
    expect(action).toBeDefined();
    action![field] = value;
    expect(() => parseBoardReadyOpsPlan(JSON.stringify(plan))).toThrow(
      'BoardReadyOps plan returned an invalid contract.'
    );
  });
});

describe('BoardReadyOps plan process and JSON consistency', () => {
  it('accepts a matching failed plan with deterministic next actions', () => {
    const parsed = parseBoardReadyOpsPlan(
      JSON.stringify(boardReadyOpsAgentPlan())
    );
    expect(() => assertBoardReadyOpsPlanVerdict(parsed, 1)).not.toThrow();
  });

  it('accepts a matching successful plan with release actions', () => {
    const plan = boardReadyOpsAgentPlan();
    plan['status'] = 'passed';
    plan['exitCode'] = 0;
    const parsed = parseBoardReadyOpsPlan(JSON.stringify(plan));
    expect(() => assertBoardReadyOpsPlanVerdict(parsed, 0)).not.toThrow();
  });

  it.each([
    ['failed process with JSON success', 1, 0, 'passed'],
    ['successful process with JSON failure', 0, 1, 'failed'],
    ['JSON status contradicts its own exit code', 1, 1, 'passed'],
    ['undocumented process code', 2, 1, 'failed']
  ])('rejects %s', (_label, processCode, jsonCode, status) => {
    const plan = boardReadyOpsAgentPlan();
    plan['exitCode'] = jsonCode;
    plan['status'] = status;
    const parsed = parseBoardReadyOpsPlan(JSON.stringify(plan));
    expect(() => assertBoardReadyOpsPlanVerdict(parsed, processCode)).toThrow(
      'BoardReadyOps plan returned inconsistent status or exit code.'
    );
  });

  it('never reports an external CLI payload in an inconsistent verdict error', () => {
    const plan = boardReadyOpsAgentPlan();
    (plan['nextActions'] as Record<string, unknown>[])[0]!['title'] =
      'PRIVATE_PLAN_SENTINEL';
    const parsed = parseBoardReadyOpsPlan(JSON.stringify(plan));
    try {
      assertBoardReadyOpsPlanVerdict(parsed, 0);
      throw new Error('Expected an inconsistency error.');
    } catch (error) {
      expect(String(error)).toContain('inconsistent status or exit code');
      expect(String(error)).not.toContain('PRIVATE_PLAN_SENTINEL');
    }
  });
});
