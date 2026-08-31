export interface BoardReadyOpsPlanAction {
  id: string;
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  fixStrategy: {
    description: string;
    steps: string[];
  };
}

export interface BoardReadyOpsPlanResult {
  schemaVersion: 1;
  tool: { name: 'boardreadyops'; version: string };
  status: 'passed' | 'failed';
  nextActions: BoardReadyOpsPlanAction[];
  releaseActions: BoardReadyOpsPlanAction[];
}

export function parseBoardReadyOpsPlan(
  stdout: string
): BoardReadyOpsPlanResult {
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim());
  } catch (err) {
    throw new Error('BoardReadyOps plan returned invalid JSON output.', {
      cause: err
    });
  }
  if (!value || typeof value !== 'object') {
    throw new Error('BoardReadyOps plan returned an invalid contract.');
  }
  type UnknownRecord = Record<string, unknown>;
  type UnknownPlan = {
    schemaVersion?: unknown;
    tool?: unknown;
    generatedAt?: unknown;
    status?: unknown;
    exitCode?: unknown;
    summary?: unknown;
    projectRoot?: unknown;
    nextActions?: unknown;
    releaseActions?: unknown;
  };
  type UnknownAction = {
    id?: unknown;
    ruleId?: unknown;
    severity?: unknown;
    title?: unknown;
    resource?: unknown;
    evidence?: unknown;
    whyItMatters?: unknown;
    fixStrategy?: unknown;
    safeAutoFixPossible?: unknown;
    commandsToVerify?: unknown;
  };
  const candidate = value as UnknownPlan;
  const isRecord = (item: unknown): item is UnknownRecord =>
    !!item && typeof item === 'object' && !Array.isArray(item);
  const isText = (item: unknown): item is string =>
    typeof item === 'string' && item.length > 0;
  const severities = new Set(['critical', 'high', 'medium', 'low', 'info']);
  const validAction = (action: unknown): action is BoardReadyOpsPlanAction => {
    if (!isRecord(action)) return false;
    const item = action as UnknownAction;
    const fixStrategy = item.fixStrategy;
    const resource = item.resource;
    const evidence = item.evidence;
    return (
      isText(item.id) &&
      isText(item.ruleId) &&
      severities.has(String(item.severity)) &&
      isText(item.title) &&
      isRecord(resource) &&
      isText(resource['path']) &&
      isText(resource['kind']) &&
      isRecord(evidence) &&
      isText(evidence['message']) &&
      isText(item.whyItMatters) &&
      isRecord(fixStrategy) &&
      isText(fixStrategy['description']) &&
      Array.isArray(fixStrategy['steps']) &&
      fixStrategy['steps'].every(isText) &&
      typeof item.safeAutoFixPossible === 'boolean' &&
      Array.isArray(item.commandsToVerify) &&
      item.commandsToVerify.length > 0 &&
      item.commandsToVerify.every(isText)
    );
  };
  const tool = candidate.tool;
  const summary = candidate.summary;
  const validSummary =
    isRecord(summary) &&
    ['total', 'critical', 'high', 'medium', 'low', 'info'].every(
      (key) => Number.isInteger(summary[key]) && Number(summary[key]) >= 0
    ) &&
    ['critical', 'high', 'medium', 'low', 'info', 'none'].includes(
      String(summary['maxSeverity'])
    ) &&
    typeof summary['failed'] === 'boolean';
  if (
    candidate.schemaVersion !== 1 ||
    !isRecord(tool) ||
    tool['name'] !== 'boardreadyops' ||
    !isText(tool['version']) ||
    !isText(candidate.generatedAt) ||
    (candidate.status !== 'passed' && candidate.status !== 'failed') ||
    !Number.isInteger(candidate.exitCode) ||
    !validSummary ||
    !isText(candidate.projectRoot) ||
    !Array.isArray(candidate.nextActions) ||
    !candidate.nextActions.every(validAction) ||
    !Array.isArray(candidate.releaseActions) ||
    !candidate.releaseActions.every(validAction)
  ) {
    throw new Error('BoardReadyOps plan returned an invalid contract.');
  }
  return candidate as unknown as BoardReadyOpsPlanResult;
}
