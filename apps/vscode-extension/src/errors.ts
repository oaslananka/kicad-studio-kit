export class KiCadCliNotFoundError extends Error {
  constructor() {
    super(
      'kicad-cli not found. Install KiCad or configure the kicadstudio.kicadCliPath setting.'
    );
    this.name = 'KiCadCliNotFoundError';
  }
}

export class KiCadCliTimeoutError extends Error {
  constructor(command: string, timeoutMs: number) {
    super(`kicad-cli command '${command}' timed out after ${timeoutMs}ms`);
    this.name = 'KiCadCliTimeoutError';
  }
}

export class CliExitError extends Error {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;

  constructor(args: {
    command: string;
    code: number;
    stdout: string;
    stderr: string;
  }) {
    super(
      `kicad-cli command '${args.command}' failed with exit code ${args.code}. ${
        (args.stderr || args.stdout).trim() ||
        'No diagnostic output was produced.'
      }`
    );
    this.name = 'CliExitError';
    this.code = args.code;
    this.stdout = args.stdout;
    this.stderr = args.stderr;
  }
}

export class AIProviderNotConfiguredError extends Error {
  constructor() {
    super(
      'AI provider not configured. Set a provider and API key in settings.'
    );
    this.name = 'AIProviderNotConfiguredError';
  }
}

export class AIStreamAbortedError extends Error {
  constructor() {
    super('AI stream was cancelled.');
    this.name = 'AIStreamAbortedError';
  }
}

export class AIRequestTimeoutError extends Error {
  constructor(providerName: string, timeoutMs: number) {
    super(
      `${providerName} request timed out after ${timeoutMs}ms. Check your connection and try again.`
    );
    this.name = 'AIRequestTimeoutError';
  }
}

export class AIHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIHttpError';
  }
}
