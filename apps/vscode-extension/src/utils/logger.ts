import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME, SETTINGS } from '../constants';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

/**
 * Structured extension logger backed by VS Code's LogOutputChannel API.
 */
export class Logger implements vscode.Disposable {
  private readonly channel: vscode.LogOutputChannel;
  private level: LogLevel;

  constructor(name = OUTPUT_CHANNEL_NAME) {
    this.channel = vscode.window.createOutputChannel(name, { log: true });
    this.level = this.readLevel();
  }

  info(message: string): void {
    if (!this.shouldLog('info')) {
      return;
    }
    this.channel.info(message);
  }

  warn(message: string): void {
    if (!this.shouldLog('warn')) {
      return;
    }
    this.channel.warn(message);
  }

  error(message: string, error?: unknown): void {
    if (!this.shouldLog('error')) {
      return;
    }
    const detail =
      error instanceof Error
        ? `${error.message}\n${error.stack ?? ''}`
        : `${error ?? ''}`;
    this.channel.error(detail ? `${message}\n${detail}` : message);
  }

  debug(message: string): void {
    if (!this.shouldLog('debug')) {
      return;
    }
    this.channel.debug(message);
  }

  refreshLevel(): void {
    this.level = this.readLevel();
    this.channel.info(`Logger level set to ${this.level}.`);
  }

  show(preserveFocus = true): void {
    this.channel.show(preserveFocus);
  }

  dispose(): void {
    this.channel.dispose();
  }

  private readLevel(): LogLevel {
    return vscode.workspace
      .getConfiguration()
      .get<LogLevel>(SETTINGS.logLevel, 'info');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_PRIORITY[level] >= LOG_PRIORITY[this.level];
  }
}
