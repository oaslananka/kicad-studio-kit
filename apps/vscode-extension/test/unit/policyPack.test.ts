import {
  PolicyPackError,
  evaluatePolicyPack,
  parsePolicyPack,
  renderPolicyReport,
  type PolicyPack
} from '../../src/policy/policyPack';

const VALID = {
  schemaVersion: 1,
  name: 'Acme Class-2',
  version: '1.0.0',
  rules: [
    { id: 'drc', type: 'maxDrcViolations', severity: 'error', max: 0 },
    { id: 'erc', type: 'maxErcViolations', severity: 'warning', max: 5 },
    {
      id: 'docs',
      type: 'requiredFiles',
      severity: 'error',
      files: ['README.md', 'docs/assembly.md']
    },
    {
      id: 'artifacts',
      type: 'requiredArtifacts',
      severity: 'warning',
      artifacts: ['gerbers', 'drill']
    },
    {
      id: 'forbidden',
      type: 'forbiddenFootprints',
      severity: 'error',
      patterns: ['Deprecated:*']
    }
  ]
};

describe('#402 policy packs', () => {
  describe('parsePolicyPack', () => {
    it('parses a valid pack', () => {
      const pack = parsePolicyPack(JSON.stringify(VALID));
      expect(pack.name).toBe('Acme Class-2');
      expect(pack.rules).toHaveLength(5);
    });

    it.each([
      [{ ...VALID, schemaVersion: 2 }, 'schemaVersion'],
      [{ ...VALID, name: '' }, 'name'],
      [{ ...VALID, version: '' }, 'version'],
      [{ ...VALID, rules: [] }, 'at least one rule'],
      [
        {
          ...VALID,
          rules: [{ id: 'a', type: 'maxDrcViolations', severity: 'x', max: 0 }]
        },
        'severity'
      ],
      [
        { ...VALID, rules: [{ id: 'a', type: 'nope', severity: 'error' }] },
        'rule type'
      ],
      [
        {
          ...VALID,
          rules: [{ id: 'a', type: 'maxDrcViolations', severity: 'error' }]
        },
        'max'
      ],
      [
        {
          ...VALID,
          rules: [
            { id: 'dup', type: 'maxDrcViolations', severity: 'error', max: 0 },
            { id: 'dup', type: 'maxErcViolations', severity: 'error', max: 0 }
          ]
        },
        'Duplicate rule id'
      ]
    ])('rejects invalid packs (%#)', (pack, fragment) => {
      expect(() => parsePolicyPack(JSON.stringify(pack))).toThrow(
        PolicyPackError
      );
      try {
        parsePolicyPack(JSON.stringify(pack));
      } catch (error) {
        expect((error as Error).message).toContain(fragment as string);
      }
    });

    it('rejects non-JSON input', () => {
      expect(() => parsePolicyPack('{not json')).toThrow(PolicyPackError);
    });
  });

  describe('evaluatePolicyPack', () => {
    const pack: PolicyPack = parsePolicyPack(JSON.stringify(VALID));

    it('passes when all error rules are satisfied', () => {
      const evaluation = evaluatePolicyPack(pack, {
        drcViolations: 0,
        ercViolations: 2,
        presentFiles: ['README.md', 'docs/assembly.md'],
        artifacts: ['gerbers', 'drill'],
        footprints: ['Resistor_SMD:R_0402']
      });
      expect(evaluation.overall).toBe('pass');
      expect(evaluation.counts.fail).toBe(0);
    });

    it('fails overall when an error-severity rule fails', () => {
      const evaluation = evaluatePolicyPack(pack, {
        drcViolations: 3,
        presentFiles: ['README.md', 'docs/assembly.md'],
        footprints: []
      });
      expect(evaluation.overall).toBe('fail');
      expect(evaluation.results.find((r) => r.id === 'drc')?.status).toBe(
        'fail'
      );
    });

    it('does not fail overall for warning-severity failures', () => {
      const evaluation = evaluatePolicyPack(pack, {
        drcViolations: 0,
        ercViolations: 99,
        presentFiles: ['README.md', 'docs/assembly.md'],
        artifacts: [],
        footprints: []
      });
      expect(evaluation.results.find((r) => r.id === 'erc')?.status).toBe(
        'fail'
      );
      expect(evaluation.results.find((r) => r.id === 'artifacts')?.status).toBe(
        'fail'
      );
      expect(evaluation.overall).toBe('pass');
    });

    it('reports unknown when facts are missing', () => {
      const evaluation = evaluatePolicyPack(pack, {});
      expect(evaluation.counts.unknown).toBe(5);
      expect(evaluation.overall).toBe('pass');
    });

    it('flags forbidden footprints via glob patterns', () => {
      const evaluation = evaluatePolicyPack(pack, {
        drcViolations: 0,
        presentFiles: ['README.md', 'docs/assembly.md'],
        footprints: ['Deprecated:OldConn', 'Resistor_SMD:R_0402']
      });
      const forbidden = evaluation.results.find((r) => r.id === 'forbidden');
      expect(forbidden?.status).toBe('fail');
      expect(forbidden?.detail).toContain('Deprecated:OldConn');
      expect(evaluation.overall).toBe('fail');
    });
  });

  describe('renderPolicyReport', () => {
    it('renders the overall verdict and a rule table', () => {
      const evaluation = evaluatePolicyPack(
        parsePolicyPack(JSON.stringify(VALID)),
        { drcViolations: 0, presentFiles: [], footprints: [] }
      );
      const report = renderPolicyReport(evaluation);
      expect(report).toContain('# Policy Pack Result');
      expect(report).toContain('Acme Class-2 (1.0.0)');
      expect(report).toContain('| Rule | Severity | Status | Detail |');
      expect(report).toContain('drc');
    });
  });
});
