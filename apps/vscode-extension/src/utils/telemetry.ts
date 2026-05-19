import * as vscode from 'vscode';
import { SETTINGS } from '../constants';

export interface TelemetrySender {
  trackCommand(commandId: string, measurements: { durationMs: number }): void;
  trackEvent?(eventName: string, properties?: Record<string, string>): void;
}

export class TelemetryService {
  constructor(private readonly sender?: TelemetrySender | undefined) {}

  trackCommand(commandId: string, durationMs: number): void {
    if (
      !vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.telemetryEnabled, false)
    ) {
      return;
    }
    this.sender?.trackCommand(commandId, { durationMs });
  }

  trackEvent(eventName: string, properties?: Record<string, string>): void {
    if (
      !vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.telemetryEnabled, false)
    ) {
      return;
    }
    this.sender?.trackEvent?.(eventName, properties);
  }
}

export const telemetry = new TelemetryService();
