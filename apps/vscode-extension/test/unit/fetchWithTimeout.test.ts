import { fetchWithTimeout } from '../../src/components/fetchWithTimeout';

describe('fetchWithTimeout', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.useRealTimers();
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes an abort signal to fetch', async () => {
    fetchMock.mockResolvedValue(new Response('ok'));

    await fetchWithTimeout('https://example.com/search');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('turns aborts into a timeout error', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );

    const promise = fetchWithTimeout('https://example.com/search', {}, 25);
    jest.advanceTimersByTime(25);

    await expect(promise).rejects.toThrow(
      'Component search request timed out after 25ms.'
    );
  });
});
