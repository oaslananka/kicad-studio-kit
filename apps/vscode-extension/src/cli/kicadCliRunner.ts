import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { CLI_TIMEOUT_MS, SETTINGS } from '../constants';
import {
  CliExitError,
  KiCadCliNotFoundError,
  KiCadCliTimeoutError
} from '../errors';
import type { CliResult, CliRunOptions, DetectedKiCadCli } from '../types';
import { Logger } from '../utils/logger';
import { findSiblingProjectFile } from '../utils/pathUtils';
import { redactSensitiveText } from '../utils/secrets';
import { KiCadCliDetector } from './kicadCliDetector';

const CLI_OUTPUT_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * Runs kicad-cli commands with progress reporting and request de-duplication.
 */
export class KiCadCliRunner {
  private readonly controllers = new Set<AbortController>();
  private readonly runningCommands = new Map<string, Promise<CliResult>>();

  constructor(
    private readonly detector: KiCadCliDetector,
    private readonly logger: Logger
  ) {}

  async run<T>(options: CliRunOptions): Promise<CliResult<T>> {
    this.validateRunOptions(options);
    const detected = await this.detector.detect(true);
    if (!detected) {
      throw new KiCadCliNotFoundError();
    }

    const command = this.buildCommandWithDefineVars(
      options.command,
      options.cwd
    );
    const key = this.buildCommandKey(options, detected, command);
    const existing = this.runningCommands.get(key);
    if (existing) {
      return this.withParsedOutput(await existing, options.parseOutput);
    }

    const next = this.executeCommand(options, detected, command);
    this.runningCommands.set(key, next);
    try {
      return this.withParsedOutput(await next, options.parseOutput);
    } finally {
      this.runningCommands.delete(key);
    }
  }

  async runWithProgress<T>(options: CliRunOptions): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
        title: options.progressTitle
      },
      async (progress, token) => {
        const progressAbort = new AbortController();
        token.onCancellationRequested(() =>
          progressAbort.abort(
            new Error(`KiCad command cancelled: ${options.command.join(' ')}`)
          )
        );
        const result = await this.run<T>({
          ...options,
          signal: composeAbortSignals(options.signal, progressAbort.signal),
          onProgress: (message) => {
            if (message) {
              progress.report({ message: message.slice(0, 120) });
              options.onProgress?.(message);
            }
          }
        });
        return (
          (result.parsed as T | undefined) ?? (result.stdout as unknown as T)
        );
      }
    );
  }

  cancelAll(): void {
    for (const controller of this.controllers) {
      controller.abort(new Error('KiCad commands cancelled.'));
    }
    this.controllers.clear();
  }

  private async executeCommand(
    options: CliRunOptions,
    detected: DetectedKiCadCli,
    command: string[]
  ): Promise<CliResult> {
    const controller = new AbortController();
    const signal = composeAbortSignals(options.signal, controller.signal);
    this.controllers.add(controller);
    const startedAt = Date.now();
    const fullArgs = [...(detected.args ?? []), ...command];
    const sensitiveCliPaths = collectSensitiveCliPaths(
      detected.path,
      options.cwd,
      fullArgs
    );
    this.logger.info(
      formatCliCommand(detected.path, fullArgs, sensitiveCliPaths)
    );

    return new Promise<CliResult>((resolve, reject) => {
      const child = spawn(detected.path, fullArgs, {
        cwd: options.cwd,
        env: {
          ...process.env,
          LANGUAGE: 'en',
          LANG: 'en_US.UTF-8',
          KICAD_LANGUAGE: 'en'
        },
        signal,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let truncatedOutputBytes = 0;
      const timeout = setTimeout(() => {
        controller.abort(
          new KiCadCliTimeoutError(
            redactCliArgs(command, sensitiveCliPaths).join(' '),
            CLI_TIMEOUT_MS
          )
        );
      }, CLI_TIMEOUT_MS);

      const finish = (handler: () => void): void => {
        clearTimeout(timeout);
        this.controllers.delete(controller);
        handler();
      };

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const redactedText = redactSensitiveText(text, sensitiveCliPaths);
        const appended = appendBoundedOutput({
          current: stdout,
          chunk,
          currentBytes: stdoutBytes,
          streamName: 'stdout',
          alreadyTruncated: stdoutTruncated
        });
        stdout = appended.value;
        stdoutBytes = appended.bytes;
        stdoutTruncated = appended.truncated;
        truncatedOutputBytes += appended.truncatedBytes;
        if (appended.truncatedBytes > 0) {
          this.logger.warn(
            `KiCad CLI stdout was truncated after ${CLI_OUTPUT_LIMIT_BYTES} bytes.`
          );
        }
        options.onProgress?.(redactedText.trim());
        this.logger.info(redactedText.trimEnd());
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const redactedText = redactSensitiveText(text, sensitiveCliPaths);
        const appended = appendBoundedOutput({
          current: stderr,
          chunk,
          currentBytes: stderrBytes,
          streamName: 'stderr',
          alreadyTruncated: stderrTruncated
        });
        stderr = appended.value;
        stderrBytes = appended.bytes;
        stderrTruncated = appended.truncated;
        truncatedOutputBytes += appended.truncatedBytes;
        if (appended.truncatedBytes > 0) {
          this.logger.warn(
            `KiCad CLI stderr was truncated after ${CLI_OUTPUT_LIMIT_BYTES} bytes.`
          );
        }
        options.onProgress?.(redactedText.trim());
        this.logger.warn(redactedText.trimEnd());
      });

      child.on('error', (error) => {
        finish(() =>
          reject(
            this.normalizeError(
              error,
              redactCliArgs(command, sensitiveCliPaths).join(' ')
            )
          )
        );
      });

      child.on('close', (exitCode) => {
        finish(() => {
          const result: CliResult = {
            stdout,
            stderr,
            exitCode: exitCode ?? -1,
            durationMs: Date.now() - startedAt,
            ...(stdoutTruncated ? { stdoutTruncated } : {}),
            ...(stderrTruncated ? { stderrTruncated } : {}),
            ...(truncatedOutputBytes ? { truncatedOutputBytes } : {})
          };

          if ((exitCode ?? -1) !== 0) {
            reject(
              new CliExitError({
                command: redactCliArgs(command, sensitiveCliPaths).join(' '),
                code: exitCode ?? -1,
                stdout: redactSensitiveText(stdout, sensitiveCliPaths),
                stderr: this.normalizeCliFailure(
                  redactSensitiveText(stderr || stdout || '', sensitiveCliPaths)
                )
              })
            );
            return;
          }
          resolve(result);
        });
      });
    });
  }

  private validateRunOptions(options: CliRunOptions): void {
    if (!path.isAbsolute(options.cwd) || !fs.existsSync(options.cwd)) {
      throw new Error(
        `KiCad command working directory must be an existing absolute path: ${options.cwd}`
      );
    }

    if (!options.command.length) {
      throw new Error('KiCad command cannot be empty.');
    }

    for (const arg of options.command) {
      if (typeof arg !== 'string' || arg.length === 0) {
        throw new Error('KiCad command arguments must be non-empty strings.');
      }
      if (/[\0\r\n]/.test(arg)) {
        throw new Error(
          'KiCad command arguments cannot contain control-line characters.'
        );
      }
    }
  }

  private buildCommandKey(
    options: CliRunOptions,
    detected: DetectedKiCadCli,
    command: string[]
  ): string {
    return JSON.stringify({
      cwd: safeRealpath(options.cwd),
      cliPath: detected.path,
      cliArgs: detected.args ?? [],
      command,
      outputMode: 'raw'
    });
  }

  private withParsedOutput<T>(
    result: CliResult,
    parseOutput: CliRunOptions['parseOutput']
  ): CliResult<T> {
    if (!parseOutput) {
      return result as CliResult<T>;
    }
    return {
      ...result,
      parsed: parseOutput(result.stdout, result.stderr) as T
    };
  }

  private normalizeError(error: unknown, command: string): Error {
    if (error instanceof KiCadCliTimeoutError) {
      return error;
    }
    if (error instanceof Error && /ENOENT/i.test(error.message)) {
      return new KiCadCliNotFoundError();
    }
    if (error instanceof Error && error.name === 'AbortError') {
      if (error.cause instanceof Error) {
        return error.cause;
      }
      return new Error(
        `KiCad command cancelled before completion: ${command}.`
      );
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  private normalizeCliFailure(message: string): string {
    if (/ENOENT/i.test(message)) {
      return new KiCadCliNotFoundError().message;
    }
    if (/No such file/i.test(message)) {
      return `KiCad command failed because a required file was not found.\n${message}`;
    }
    return `KiCad command failed.\n${message}`;
  }

  private buildCommandWithDefineVars(command: string[], cwd: string): string[] {
    const configuredVars = vscode.workspace
      .getConfiguration()
      .get<Record<string, string>>(SETTINGS.cliDefineVars, {});
    const projectVars = this.readProjectTextVariables(command, cwd);
    const mergedVars = {
      ...projectVars,
      ...configuredVars
    };

    const defineArgs = Object.entries(mergedVars)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'string'
      )
      .flatMap(([key, value]) => ['--define-var', `${key}=${value}`]);

    return defineArgs.length ? [...defineArgs, ...command] : command;
  }

  private readProjectTextVariables(
    command: string[],
    cwd: string
  ): Record<string, string> {
    const targetFile = command.find(
      (entry) =>
        entry.endsWith('.kicad_pro') ||
        entry.endsWith('.kicad_sch') ||
        entry.endsWith('.kicad_pcb')
    );
    const projectFile = targetFile
      ? findSiblingProjectFile(
          path.isAbsolute(targetFile) ? targetFile : path.join(cwd, targetFile)
        )
      : undefined;
    if (!projectFile || !fs.existsSync(projectFile)) {
      return {};
    }

    try {
      const raw = JSON.parse(fs.readFileSync(projectFile, 'utf8')) as {
        text_variables?: Record<string, string> | undefined;
      };
      return raw.text_variables ?? {};
    } catch {
      return {};
    }
  }
}

function safeRealpath(targetPath: string): string {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function formatCliCommand(
  command: string,
  args: string[],
  sensitivePaths: readonly string[]
): string {
  return `Running ${redactSensitiveText(command, sensitivePaths)} ${redactCliArgs(args, sensitivePaths).join(' ')}`;
}

function redactCliArgs(
  args: string[],
  sensitivePaths: readonly string[] = []
): string[] {
  const redacted: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index] ?? '';
    if (args[index - 1] === '--define-var') {
      const key = current.split('=')[0] ?? 'VALUE';
      redacted.push(`${key}=***`);
      continue;
    }
    redacted.push(redactSensitiveText(current, sensitivePaths));
  }
  return redacted;
}

function collectSensitiveCliPaths(
  cliPath: string,
  cwd: string,
  args: readonly string[]
): string[] {
  const values = new Set<string>();
  for (const value of [cliPath, cwd, ...args]) {
    if (isSensitiveCliPath(value)) {
      values.add(value);
      values.add(value.replaceAll('\\', '/'));
      values.add(value.replaceAll('/', '\\'));
    }
  }
  return [...values]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

function isSensitiveCliPath(value: string): boolean {
  if (!value) {
    return false;
  }
  return (
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /[/\\]/.test(value) ||
    /\.(?:kicad_(?:pro|sch|pcb|dru|jobset)|gbr|drl|pdf|svg|zip|csv|xlsx|json|html|net)$/i.test(
      value
    )
  );
}

function appendBoundedOutput(options: {
  current: string;
  chunk: Buffer;
  currentBytes: number;
  streamName: 'stdout' | 'stderr';
  alreadyTruncated: boolean;
}): {
  value: string;
  bytes: number;
  truncated: boolean;
  truncatedBytes: number;
} {
  if (options.currentBytes >= CLI_OUTPUT_LIMIT_BYTES) {
    return {
      value: options.current,
      bytes: options.currentBytes + options.chunk.byteLength,
      truncated: true,
      truncatedBytes: options.chunk.byteLength
    };
  }

  const remaining = CLI_OUTPUT_LIMIT_BYTES - options.currentBytes;
  if (options.chunk.byteLength <= remaining) {
    return {
      value: options.current + options.chunk.toString('utf8'),
      bytes: options.currentBytes + options.chunk.byteLength,
      truncated: options.alreadyTruncated,
      truncatedBytes: 0
    };
  }

  const marker = `\n[KiCad Studio truncated ${options.streamName} after 10 MB]\n`;
  return {
    value:
      options.current +
      options.chunk.subarray(0, remaining).toString('utf8') +
      marker,
    bytes: options.currentBytes + options.chunk.byteLength,
    truncated: true,
    truncatedBytes: options.chunk.byteLength - remaining
  };
}

function composeAbortSignals(
  primary: AbortSignal | undefined,
  secondary: AbortSignal
): AbortSignal {
  if (!primary) {
    return secondary;
  }
  if (primary.aborted) {
    return primary;
  }

  const controller = new AbortController();
  const abortFrom = (source: AbortSignal): void => {
    controller.abort(source.reason);
  };

  primary.addEventListener('abort', () => abortFrom(primary), { once: true });
  secondary.addEventListener('abort', () => abortFrom(secondary), {
    once: true
  });
  return controller.signal;
}
