import { AI_STREAM_TIMEOUT_MS } from '../constants';
import { AIRequestTimeoutError, AIStreamAbortedError } from '../errors';

interface ManagedSignal {
  signal: AbortSignal;
  cleanup: () => void;
  wasTimeoutTriggered: () => boolean;
}

export function createManagedAbortSignal(
  providerName: string,
  timeoutMs = AI_STREAM_TIMEOUT_MS,
  externalSignal?: AbortSignal
): ManagedSignal {
  const controller = new AbortController();
  let timeoutTriggered = false;
  const timeout = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort(new AIRequestTimeoutError(providerName, timeoutMs));
  }, timeoutMs);

  const abortFromExternal = (): void => {
    controller.abort(externalSignal?.reason ?? new AIStreamAbortedError());
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternal();
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, {
        once: true
      });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', abortFromExternal);
      }
    },
    wasTimeoutTriggered: () => timeoutTriggered
  };
}

export async function readEventStream(
  response: Response,
  onEvent: (eventName: string, payload: string) => void | Promise<void>
): Promise<void> {
  if (!response.body) {
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    buffer += result.value;

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex >= 0) {
      const rawEvent = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      await dispatchEvent(rawEvent, onEvent);
      boundaryIndex = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    await dispatchEvent(buffer, onEvent);
  }
}

async function dispatchEvent(
  rawEvent: string,
  onEvent: (eventName: string, payload: string) => void | Promise<void>
): Promise<void> {
  const eventLines = rawEvent
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (!eventLines.length) {
    return;
  }

  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of eventLines) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  await onEvent(eventName, dataLines.join('\n'));
}
