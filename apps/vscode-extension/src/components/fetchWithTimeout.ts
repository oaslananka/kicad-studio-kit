const DEFAULT_COMPONENT_SEARCH_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_COMPONENT_SEARCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  // Compose the timeout signal with any caller-provided signal so both can cancel the request.
  const signals: AbortSignal[] = [controller.signal];
  if (init.signal instanceof AbortSignal) {
    signals.push(init.signal);
  }
  const composedSignal = AbortSignal.any(signals);

  try {
    return await fetch(input, {
      ...init,
      signal: composedSignal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        `Component search request timed out after ${timeoutMs}ms.`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
