import {
  buildScorecard,
  renderScorecardHtml,
  renderScorecardMarkdown,
  type ScorecardDimensionInput
} from '../../src/scorecard/readinessScorecard';

function dim(
  id: string,
  status: ScorecardDimensionInput['status'],
  extra: Partial<ScorecardDimensionInput> = {}
): ScorecardDimensionInput {
  return { id, label: id, status, ...extra };
}

describe('#404 readiness scorecard', () => {
  describe('buildScorecard', () => {
    it('passes and scores 100 when all dimensions pass', () => {
      const card = buildScorecard({
        project: 'p.kicad_pro',
        dimensions: [dim('design', 'pass'), dim('docs', 'pass')]
      });
      expect(card.status).toBe('pass');
      expect(card.score).toBe(100);
    });

    it('fails overall when any dimension fails, even with a high score', () => {
      const card = buildScorecard({
        project: 'p.kicad_pro',
        dimensions: [
          dim('a', 'pass'),
          dim('b', 'pass'),
          dim('c', 'pass'),
          dim('release', 'fail')
        ]
      });
      expect(card.status).toBe('fail');
      // 3 pass (100) + 1 fail (0) → 75, but status is still fail.
      expect(card.score).toBe(75);
    });

    it('warns when a dimension warns but none fail', () => {
      const card = buildScorecard({
        project: 'p.kicad_pro',
        dimensions: [dim('a', 'pass'), dim('b', 'warn')]
      });
      expect(card.status).toBe('warn');
      expect(card.score).toBe(80);
    });

    it('excludes not-applicable dimensions from the score', () => {
      const card = buildScorecard({
        project: 'p.kicad_pro',
        dimensions: [dim('a', 'pass'), dim('b', 'not-applicable')]
      });
      expect(card.score).toBe(100);
      expect(card.dimensions[1]?.score).toBeNull();
    });

    it('treats critical/high findings as blocking regardless of score', () => {
      const card = buildScorecard({
        project: 'p.kicad_pro',
        dimensions: [
          dim('a', 'pass', {
            findings: [
              {
                id: 'f1',
                severity: 'critical',
                message: 'shorted net',
                remediation: 'fix the short'
              }
            ]
          })
        ]
      });
      expect(card.status).toBe('fail');
      expect(card.blockingFindings).toHaveLength(1);
      expect(card.score).toBe(100);
    });

    it('collects medium findings as warnings', () => {
      const card = buildScorecard({
        project: 'p.kicad_pro',
        dimensions: [
          dim('a', 'pass', {
            findings: [
              { id: 'w1', severity: 'medium', message: 'silk overlap' }
            ]
          })
        ]
      });
      expect(card.status).toBe('warn');
      expect(card.warnings).toHaveLength(1);
    });

    it('passes through artifacts and tool versions', () => {
      const card = buildScorecard({
        project: 'p.kicad_pro',
        dimensions: [dim('a', 'pass')],
        artifacts: ['gerbers.zip'],
        toolVersions: { 'kicad-cli': '10.0.3' }
      });
      expect(card.artifacts).toEqual(['gerbers.zip']);
      expect(card.toolVersions['kicad-cli']).toBe('10.0.3');
    });
  });

  describe('rendering', () => {
    const card = buildScorecard({
      project: 'p.kicad_pro',
      dimensions: [
        dim('Design checks', 'fail', {
          remediation: 'Resolve DRC errors',
          findings: [
            { id: 'f1', severity: 'high', message: 'clearance violation' }
          ]
        }),
        dim('Documentation', 'pass')
      ],
      artifacts: ['gerbers.zip']
    });

    it('renders Markdown with status, dimensions, and blocking findings', () => {
      const md = renderScorecardMarkdown(card);
      expect(md).toContain('# Release Readiness Scorecard');
      expect(md).toContain('FAIL');
      expect(md).toContain('Design checks');
      expect(md).toContain('## Blocking findings');
      expect(md).toContain('clearance violation');
      expect(md).toContain('gerbers.zip');
    });

    it('renders escaped HTML', () => {
      const html = renderScorecardHtml(
        buildScorecard({
          project: '<p>.kicad_pro',
          dimensions: [dim('Design & DRC', 'pass')]
        })
      );
      expect(html).toContain('<h1>Release Readiness Scorecard</h1>');
      expect(html).toContain('&lt;p&gt;.kicad_pro');
      expect(html).toContain('Design &amp; DRC');
    });
  });
});
