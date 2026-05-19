import { AIRequestTimeoutError, AIStreamAbortedError } from '../../src/errors';
import {
  createManagedAbortSignal,
  readEventStream
} from '../../src/ai/providerUtils';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      }
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    }
  );
}

describe('providerUtils', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a timeout-backed abort signal', () => {
    jest.useFakeTimers();

    const managed = createManagedAbortSignal('OpenAI', 50);
    jest.advanceTimersByTime(51);

    expect(managed.signal.aborted).toBe(true);
    expect(managed.signal.reason).toBeInstanceOf(AIRequestTimeoutError);
    expect(managed.wasTimeoutTriggered()).toBe(true);

    managed.cleanup();
  });

  it('propagates external abort reasons', () => {
    const controller = new AbortController();
    const managed = createManagedAbortSignal('Claude', 1000, controller.signal);

    controller.abort(new AIStreamAbortedError());

    expect(managed.signal.aborted).toBe(true);
    expect(managed.signal.reason).toBeInstanceOf(AIStreamAbortedError);

    managed.cleanup();
  });

  it('honors an external signal that was aborted before creation', () => {
    const controller = new AbortController();
    const reason = new Error('already cancelled');
    controller.abort(reason);

    const managed = createManagedAbortSignal('Claude', 1000, controller.signal);

    expect(managed.signal.aborted).toBe(true);
    expect(managed.signal.reason).toBe(reason);

    managed.cleanup();
  });

  it('reads SSE events including trailing buffers and missing bodies', async () => {
    const events: Array<{ eventName: string; payload: string }> = [];

    await readEventStream(
      sseResponse(['event: hello\ndata: one\n\n', 'data: two', '\n\n']),
      async (eventName, payload) => {
        events.push({ eventName, payload });
      }
    );

    await readEventStream(new Response(null, { status: 200 }), async () => {
      throw new Error('should not be called');
    });

    expect(events).toEqual([
      { eventName: 'hello', payload: 'one' },
      { eventName: 'message', payload: 'two' }
    ]);
  });

  it('dispatches trailing SSE buffers and ignores blank events', async () => {
    const events: Array<{ eventName: string; payload: string }> = [];

    await readEventStream(
      sseResponse(['\n\n', 'event: done\ndata: tail']),
      (eventName, payload) => {
        events.push({ eventName, payload });
      }
    );

    expect(events).toEqual([{ eventName: 'done', payload: 'tail' }]);
  });
});
