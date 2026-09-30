import assert from "node:assert/strict";
import test from "node:test";

import { buildCorepackInvocation } from "./check-repeatable-vsix.mjs";

test("buildCorepackInvocation uses ComSpec for Windows command shims", () => {
  assert.deepEqual(
    buildCorepackInvocation("win32", "C:\\Windows\\System32\\cmd.exe", [
      "pnpm",
      "--version",
    ]),
    {
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "corepack", "pnpm", "--version"],
    },
  );
});

test("buildCorepackInvocation invokes corepack directly off Windows", () => {
  assert.deepEqual(
    buildCorepackInvocation("linux", undefined, ["pnpm", "--version"]),
    {
      command: "corepack",
      args: ["pnpm", "--version"],
    },
  );
});
