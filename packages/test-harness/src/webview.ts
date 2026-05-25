export interface MockVsCodeApi<State = unknown> {
  readonly messages: unknown[];
  postMessage(message: unknown): void;
  getState(): State | undefined;
  setState(state: State): State;
}

export interface PlaywrightLikeFrame {
  name?(): string;
  url(): string;
  evaluate<T, Arg>(
    pageFunction: (arg: Arg) => T | Promise<T>,
    arg: Arg,
  ): Promise<T>;
}

export interface PlaywrightLikePage {
  frames(): PlaywrightLikeFrame[];
  addInitScript<Arg>(
    pageFunction: (arg: Arg) => void | Promise<void>,
    arg: Arg,
  ): Promise<void>;
  evaluate<T, Arg>(
    pageFunction: (arg: Arg) => T | Promise<T>,
    arg: Arg,
  ): Promise<T>;
}

export interface MockAcquireVsCodeApiScriptOptions {
  globalName?: string;
}

export interface ReadMockWebviewMessagesOptions extends MockAcquireVsCodeApiScriptOptions {
  frameMatcher?: RegExp | ((frame: PlaywrightLikeFrame) => boolean);
}

type PlaywrightLikeEvaluationTarget = Pick<PlaywrightLikePage, "evaluate">;

export function createMockVsCodeApi<State = unknown>(
  initialState?: State,
): MockVsCodeApi<State> {
  let state = initialState;
  const messages: unknown[] = [];
  return {
    messages,
    postMessage(message: unknown) {
      messages.push(message);
    },
    getState() {
      return state;
    },
    setState(nextState: State) {
      state = nextState;
      return nextState;
    },
  };
}

export function installMockAcquireVsCodeApi<State = unknown>(
  target: Record<string, unknown>,
  api = createMockVsCodeApi<State>(),
): MockVsCodeApi<State> {
  target["acquireVsCodeApi"] = () => api;
  return api;
}

export function findWebviewFrame(
  page: Pick<PlaywrightLikePage, "frames">,
  matcher:
    | RegExp
    | ((frame: PlaywrightLikeFrame) => boolean) = /webview|vscode-webview/iu,
): PlaywrightLikeFrame | undefined {
  const predicate =
    matcher instanceof RegExp
      ? (frame: PlaywrightLikeFrame) =>
          matcher.test(frame.url()) || matcher.test(frame.name?.() ?? "")
      : matcher;
  return page.frames().find((frame) => predicate(frame));
}

export async function installMockAcquireVsCodeApiScript(
  page: Pick<PlaywrightLikePage, "addInitScript">,
  options: MockAcquireVsCodeApiScriptOptions = {},
): Promise<void> {
  await page.addInitScript(
    ({ globalName }) => {
      const target = globalThis as typeof globalThis & Record<string, unknown>;
      target[globalName] = {
        messages: [],
        state: undefined,
      };
      target["acquireVsCodeApi"] = () => ({
        postMessage(message: unknown) {
          (target[globalName] as { messages: unknown[] }).messages.push(
            message,
          );
        },
        getState() {
          return (target[globalName] as { state: unknown }).state;
        },
        setState(state: unknown) {
          (target[globalName] as { state: unknown }).state = state;
          return state;
        },
      });
    },
    { globalName: options.globalName ?? "__kicadVsCodeApiMock" },
  );
}

export async function readMockWebviewMessages(
  target: PlaywrightLikeEvaluationTarget &
    Partial<Pick<PlaywrightLikePage, "frames">>,
  options: ReadMockWebviewMessagesOptions = {},
): Promise<unknown[]> {
  const evaluationTarget = hasFrames(target)
    ? (findWebviewFrame(target, options.frameMatcher) ?? target)
    : target;
  return evaluationTarget.evaluate(
    ({ globalName }) => {
      const target = globalThis as typeof globalThis & Record<string, unknown>;
      return [
        ...((target[globalName] as { messages?: unknown[] })?.messages ?? []),
      ];
    },
    { globalName: options.globalName ?? "__kicadVsCodeApiMock" },
  );
}

function hasFrames(
  target: PlaywrightLikeEvaluationTarget &
    Partial<Pick<PlaywrightLikePage, "frames">>,
): target is PlaywrightLikeEvaluationTarget &
  Pick<PlaywrightLikePage, "frames"> {
  return typeof target.frames === "function";
}
