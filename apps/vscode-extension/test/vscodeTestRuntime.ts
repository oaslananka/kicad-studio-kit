export const DEFAULT_VSCODE_TEST_VERSION = '1.122.0';

const TRANSIENT_VSCODE_DOWNLOAD_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET'
]);

type TestEnvironment = Record<string, string | undefined>;
type VsCodeDownloader = (version: string) => Promise<string>;

interface VsCodeDownloadRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

export type VsCodeTestSuite = 'suite' | 'canarySuite';

export async function downloadVsCodeWithRetry(
  version: string,
  download: VsCodeDownloader,
  options: VsCodeDownloadRetryOptions = {}
): Promise<string> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const sleep =
    options.sleep ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError('VS Code download attempts must be at least 1');
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError('VS Code download retry delay must be non-negative');
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await download(version);
    } catch (error) {
      if (attempt === attempts || !isTransientDownloadError(error)) {
        throw error;
      }
      const delayMs = baseDelayMs * attempt;
      console.warn(
        `Transient VS Code host download failure; retrying in ${delayMs}ms (${attempt}/${attempts - 1}).`
      );
      await sleep(delayMs);
    }
  }

  throw new Error('VS Code host download retry budget was exhausted');
}

export function resolveVsCodeTestVersion(
  env: TestEnvironment = process.env
): string {
  return (
    env['KICADSTUDIO_VSCODE_VERSION']?.trim() || DEFAULT_VSCODE_TEST_VERSION
  );
}

export function resolveVsCodeTestSuite(
  env: TestEnvironment = process.env
): VsCodeTestSuite {
  return env['KICADSTUDIO_VSCODE_TEST_SUITE']?.trim() === 'canary'
    ? 'canarySuite'
    : 'suite';
}

function isTransientDownloadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    cause?: unknown;
    errors?: unknown;
  };
  if (
    typeof candidate.code === 'string' &&
    TRANSIENT_VSCODE_DOWNLOAD_CODES.has(candidate.code)
  ) {
    return true;
  }
  if (
    Array.isArray(candidate.errors) &&
    candidate.errors.some(isTransientDownloadError)
  ) {
    return true;
  }
  return (
    candidate.cause !== undefined && isTransientDownloadError(candidate.cause)
  );
}
