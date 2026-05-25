import assert from "node:assert/strict";
import test from "node:test";

import {
  createMockVsCodeApi,
  findWebviewFrame,
  installMockAcquireVsCodeApi,
  installMockAcquireVsCodeApiScript,
  readMockWebviewMessages,
} from "../src/index";

test("records webview messages and state transitions", () => {
  const api = createMockVsCodeApi<{ selected: string }>({
    selected: "schematic",
  });
  api.postMessage({ type: "ready" });
  api.setState({ selected: "pcb" });

  assert.deepEqual(api.messages, [{ type: "ready" }]);
  assert.deepEqual(api.getState(), { selected: "pcb" });
});

test("installs acquireVsCodeApi on a webview-like global", () => {
  const target: Record<string, unknown> = {};
  const api = installMockAcquireVsCodeApi(target);
  const factory = target["acquireVsCodeApi"] as () => typeof api;

  assert.equal(factory(), api);
});

test("finds Playwright-like VS Code webview frames", () => {
  const frame = findWebviewFrame({
    frames: () => [
      { name: () => "main", url: () => "https://example.test", evaluate },
      { name: () => "panel", url: () => "vscode-webview://panel", evaluate },
    ],
  });

  assert.equal(frame?.url(), "vscode-webview://panel");
});

test("installs and reads a Playwright-like webview API script", async () => {
  const target: Record<string, unknown> = {};
  const page = {
    frames: () => [],
    async addInitScript<Arg>(pageFunction: (arg: Arg) => void, arg: Arg) {
      const globalTarget = globalThis as typeof globalThis &
        Record<string, unknown>;
      const previousAcquire = globalTarget["acquireVsCodeApi"];
      const previousMock = globalTarget["__kicadVsCodeApiMock"];
      try {
        pageFunction(arg);
        target["acquireVsCodeApi"] = globalTarget["acquireVsCodeApi"];
        target["mock"] = globalTarget["__kicadVsCodeApiMock"];
      } finally {
        globalTarget["acquireVsCodeApi"] = previousAcquire;
        globalTarget["__kicadVsCodeApiMock"] = previousMock;
      }
    },
    async evaluate<T, Arg>(
      pageFunction: (arg: Arg) => T | Promise<T>,
      arg: Arg,
    ): Promise<T> {
      const globalTarget = globalThis as typeof globalThis &
        Record<string, unknown>;
      const previousMock = globalTarget["__kicadVsCodeApiMock"];
      try {
        globalTarget["__kicadVsCodeApiMock"] = target["mock"];
        return pageFunction(arg);
      } finally {
        globalTarget["__kicadVsCodeApiMock"] = previousMock;
      }
    },
  };

  await installMockAcquireVsCodeApiScript(page);
  const globalTarget = globalThis as typeof globalThis &
    Record<string, unknown>;
  const previousMock = globalTarget["__kicadVsCodeApiMock"];
  try {
    globalTarget["__kicadVsCodeApiMock"] = target["mock"];
    (
      target["acquireVsCodeApi"] as () => {
        postMessage(message: unknown): void;
      }
    )().postMessage({ command: "ready" });
  } finally {
    globalTarget["__kicadVsCodeApiMock"] = previousMock;
  }

  assert.deepEqual(await readMockWebviewMessages(page), [{ command: "ready" }]);
});

test("reads webview messages from the matching frame context", async () => {
  const mainTarget = { __kicadVsCodeApiMock: { messages: [] } };
  const webviewTarget = {
    __kicadVsCodeApiMock: { messages: [{ command: "ready" }] },
  };
  const mainFrame = {
    name: () => "main",
    url: () => "https://example.test",
    evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg) {
      return evaluateInTarget(mainTarget, pageFunction, arg);
    },
  };
  const webviewFrame = {
    name: () => "panel",
    url: () => "vscode-webview://panel",
    evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg) {
      return evaluateInTarget(webviewTarget, pageFunction, arg);
    },
  };
  const page = {
    frames: () => [mainFrame, webviewFrame],
    evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg) {
      return evaluateInTarget(mainTarget, pageFunction, arg);
    },
  };

  assert.deepEqual(await readMockWebviewMessages(page), [{ command: "ready" }]);
});

function evaluate<T, Arg>(
  pageFunction: (arg: Arg) => T | Promise<T>,
  arg: Arg,
): Promise<T> {
  return Promise.resolve(pageFunction(arg));
}

async function evaluateInTarget<T, Arg>(
  target: Record<string, unknown>,
  pageFunction: (arg: Arg) => T | Promise<T>,
  arg: Arg,
): Promise<T> {
  const globalTarget = globalThis as typeof globalThis &
    Record<string, unknown>;
  const previousMock = globalTarget["__kicadVsCodeApiMock"];
  try {
    globalTarget["__kicadVsCodeApiMock"] = target["__kicadVsCodeApiMock"];
    return await pageFunction(arg);
  } finally {
    globalTarget["__kicadVsCodeApiMock"] = previousMock;
  }
}
