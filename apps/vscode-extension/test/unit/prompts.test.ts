import {
  buildCircuitExplanationPrompt,
  buildComponentRecommendationPrompt,
  buildErrorAnalysisPrompt,
  buildNetAnalysisPrompt,
  buildProactiveDRCPrompt,
  buildSystemPrompt,
  normalizeAiLanguage
} from '../../src/ai/prompts';

describe('AI prompt builders', () => {
  it('normalizes supported languages and falls back to English', () => {
    expect(normalizeAiLanguage('fr')).toBe('fr');
    expect(normalizeAiLanguage('pt-BR')).toBe('pt-BR');
    expect(normalizeAiLanguage('unknown')).toBe('en');
  });

  it('builds system prompts with project context details', () => {
    const prompt = buildSystemPrompt('tr', {
      projectName: 'motor-control',
      boardLayers: 4,
      kicadVersion: '10.0.0',
      activeVariant: 'Assembly-A',
      mcpConnected: true
    });

    expect(prompt).toContain('Respond in Turkish.');
    expect(prompt).toContain('Project name: motor-control.');
    expect(prompt).toContain('Board has 4 layers.');
    expect(prompt).toContain('KiCad version: 10.0.0.');
    expect(prompt).toContain('Active design variant: Assembly-A.');
    expect(prompt).toContain('MCP integration is connected');
  });

  it('builds error analysis prompts with fallbacks', () => {
    const prompt = buildErrorAnalysisPrompt({ message: 'Clearance violation' });

    expect(prompt).toContain('Issue: Clearance violation');
    expect(prompt).toContain('Rule: unknown');
    expect(prompt).toContain('Board context: unknown board');
  });

  it('builds component prompts with and without specs', () => {
    const withSpecs = buildComponentRecommendationPrompt('10k', '0603', [
      '1%',
      '0.1W'
    ]);
    const withoutSpecs = buildComponentRecommendationPrompt('', '', []);

    expect(withSpecs).toContain('1%, 0.1W');
    expect(withoutSpecs).toContain('Current value: unknown');
    expect(withoutSpecs).toContain('Required specs: none provided');
  });

  it('builds the circuit explanation prompt', () => {
    expect(buildCircuitExplanationPrompt()).toContain(
      'selected KiCad circuit block'
    );
  });

  it('builds proactive DRC and net analysis prompts', () => {
    const drcPrompt = buildProactiveDRCPrompt(
      [
        'Track too close to board edge',
        'Unconnected net',
        'Clearance violation on F.Cu'
      ],
      '4-layer motor board'
    );
    const netPrompt = buildNetAnalysisPrompt('VBUS', []);

    expect(drcPrompt).toContain('1. Track too close to board edge');
    expect(drcPrompt).toContain('Board info: 4-layer motor board');
    expect(drcPrompt).toContain('clearance (1): Clearance violation on F.Cu');
    expect(drcPrompt).toContain('unconnected (1): Unconnected net');
    expect(drcPrompt).toContain(
      'mechanical (1): Track too close to board edge'
    );
    expect(netPrompt).toContain('Net name: VBUS');
    expect(netPrompt).toContain('Connections: none provided');
  });
});
