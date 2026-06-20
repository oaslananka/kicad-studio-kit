import * as vscode from 'vscode';
import { resolveSafeWorkspacePath } from '../utils/pathUtils';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';

/**
 * Centralized guard layer for state-changing operations (write, export, import,
 * manufacturing, and MCP operations that can affect project state).
 *
 * Every such operation should flow through this module rather than re-checking
 * trust and path safety ad hoc, and rather than relying only on hiding commands
 * from menus. The guarantees provided here are:
 *
 * - workspace-trust gating (Restricted Mode cannot mutate project state);
 * - path canonicalization + symlink-resolved workspace-boundary checks for any
 *   user-supplied output path (defeats `..` traversal and symlink escape);
 * - explicit user confirmation for risky operations;
 * - an opt-in dry-run / preview that resolves and validates without executing;
 * - safe, code-tagged error messages that do not leak host paths.
 */

export type GuardedOperationKind =
  | 'write'
  | 'export'
  | 'import'
  | 'manufacturing'
  | 'mcp';

export type GuardedOperationErrorCode =
  | 'untrusted'
  | 'no-workspace'
  | 'path-escape';

/** Error type whose `message` is always safe to surface to the user. */
export class GuardedOperationError extends Error {
  constructor(
    message: string,
    readonly code: GuardedOperationErrorCode
  ) {
    super(message);
    this.name = 'GuardedOperationError';
  }
}

/** Throw a {@link GuardedOperationError} when the workspace is not trusted. */
export function assertWorkspaceTrusted(feature: string): void {
  if (!isWorkspaceTrusted()) {
    throw new GuardedOperationError(
      `${feature} is disabled in Restricted Mode. Trust this workspace to continue.`,
      'untrusted'
    );
  }
}

export interface GuardedPathOptions {
  requestedPath: string;
  /** Workspace root to confine the path to; defaults to the first folder. */
  workspaceRoot?: string | undefined;
  /** Human label used in the error message, e.g. "Output directory". */
  label?: string | undefined;
}

/**
 * Resolve a user-supplied path and assert it stays inside the workspace. Throws
 * a {@link GuardedOperationError} (never a raw path-leaking error) on escape or
 * when no workspace is open.
 */
export function resolveGuardedPath(options: GuardedPathOptions): string {
  const workspaceRoot =
    options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const label = options.label ?? 'Path';
  if (!workspaceRoot) {
    throw new GuardedOperationError(
      `${label} requires an open workspace folder.`,
      'no-workspace'
    );
  }
  try {
    return resolveSafeWorkspacePath(
      workspaceRoot,
      options.requestedPath,
      `${label} must stay inside the open workspace.`
    );
  } catch (error) {
    throw new GuardedOperationError(
      error instanceof Error
        ? error.message
        : `${label} must stay inside the open workspace.`,
      'path-escape'
    );
  }
}

export interface ConfirmOptions {
  message: string;
  confirmLabel: string;
  detail?: string | undefined;
}

/** Modal confirmation for a risky operation. Returns true only on confirm. */
export async function confirmRiskyOperation(
  options: ConfirmOptions
): Promise<boolean> {
  const messageOptions: vscode.MessageOptions = { modal: true };
  if (options.detail !== undefined) {
    messageOptions.detail = options.detail;
  }
  const choice = await vscode.window.showWarningMessage(
    options.message,
    messageOptions,
    options.confirmLabel
  );
  return choice === options.confirmLabel;
}

export interface GuardedOperationOptions {
  feature: string;
  kind: GuardedOperationKind;
  /** Defaults to true; set false only for read-only previews. */
  requireTrust?: boolean;
  /** When set, the path is resolved + boundary-checked before the action runs. */
  outputPath?: GuardedPathOptions;
  /** When set, the user must confirm before the action runs. */
  confirm?: ConfirmOptions;
  /** When true, validate everything but do not run the action. */
  dryRun?: boolean;
}

export type GuardedOperationOutcome = 'completed' | 'dry-run' | 'cancelled';

export interface GuardedOperationResult<T> {
  outcome: GuardedOperationOutcome;
  /** The validated, workspace-safe path, when `outputPath` was provided. */
  safePath?: string | undefined;
  value?: T | undefined;
}

/**
 * Run `action` only after trust, path-safety, and confirmation guards pass.
 * Throws {@link GuardedOperationError} when a guard fails; returns a
 * discriminated result describing whether the action ran, was previewed
 * (dry-run), or was cancelled at the confirmation step.
 */
export async function runGuardedOperation<T>(
  options: GuardedOperationOptions,
  action: (ctx: { safePath?: string | undefined }) => Promise<T>
): Promise<GuardedOperationResult<T>> {
  if (options.requireTrust !== false) {
    assertWorkspaceTrusted(options.feature);
  }
  const safePath = options.outputPath
    ? resolveGuardedPath(options.outputPath)
    : undefined;
  if (options.dryRun) {
    return { outcome: 'dry-run', safePath };
  }
  if (options.confirm) {
    const confirmed = await confirmRiskyOperation(options.confirm);
    if (!confirmed) {
      return { outcome: 'cancelled', safePath };
    }
  }
  const value = await action({ safePath });
  return { outcome: 'completed', safePath, value };
}
