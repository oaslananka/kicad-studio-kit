import { spawnSync } from "node:child_process";

import { redactCommandForLog, redactSecrets } from "./logs";

export interface KicadCliInvocation {
  args: readonly string[];
  executable?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  allowNonZeroExit?: boolean;
  sensitiveValues?: readonly string[];
}

export interface KicadCliResult {
  command: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export function buildKicadCliArgs(
  subcommand: string,
  args: readonly string[] = [],
): string[] {
  return [subcommand, ...args];
}

export function runKicadCli(invocation: KicadCliInvocation): KicadCliResult {
  const executable = invocation.executable ?? "kicad-cli";
  const result = spawnSync(executable, [...invocation.args], {
    cwd: invocation.cwd,
    env: invocation.env,
    encoding: "utf8",
    timeout: invocation.timeoutMs,
  });
  const output: KicadCliResult = {
    command: redactCommandForLog(
      executable,
      invocation.args,
      invocation.sensitiveValues,
    ),
    status: result.status,
    signal: result.signal,
    stdout: redactSecrets(result.stdout ?? "", invocation.sensitiveValues),
    stderr: redactSecrets(result.stderr ?? "", invocation.sensitiveValues),
  };

  if (!invocation.allowNonZeroExit && output.status !== 0) {
    throw new Error(
      `kicad-cli failed with status ${String(output.status)}: ${output.stderr || output.stdout}`,
    );
  }

  return output;
}
