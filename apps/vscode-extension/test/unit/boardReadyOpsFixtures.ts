export function boardReadyOpsDoctorContract(version = '1.37.0') {
  return {
    schemaVersion: 1,
    tool: { name: 'boardreadyops', version },
    checks: []
  };
}

export function boardReadyOpsAgentPlan(): Record<string, unknown> {
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
