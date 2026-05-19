import {
  AIHttpError,
  AIProviderNotConfiguredError,
  AIRequestTimeoutError,
  AIStreamAbortedError,
  CliExitError,
  KiCadCliNotFoundError,
  KiCadCliTimeoutError
} from '../../src/errors';

describe('custom errors', () => {
  it('provides actionable domain-specific messages', () => {
    expect(new KiCadCliNotFoundError().message).toContain(
      'kicad-cli not found'
    );
    expect(new KiCadCliNotFoundError().message).toContain(
      'kicadstudio.kicadCliPath'
    );
    expect(
      new KiCadCliTimeoutError('pcb export gerbers', 1234).message
    ).toContain('1234ms');
    expect(new AIProviderNotConfiguredError().message).toContain(
      'AI provider not configured'
    );
    expect(new AIStreamAbortedError().message).toContain('cancelled');
    expect(new AIRequestTimeoutError('OpenAI', 120000).message).toContain(
      'OpenAI request timed out'
    );
    expect(new AIHttpError('rate limited').message).toBe('rate limited');
  });

  it('uses explicit no-output wording for silent CLI failures', () => {
    expect(
      new CliExitError({
        command: 'pcb drc',
        code: 2,
        stdout: '',
        stderr: ''
      }).message
    ).toContain('No diagnostic output was produced.');
  });
});
