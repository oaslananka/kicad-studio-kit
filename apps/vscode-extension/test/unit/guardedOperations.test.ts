import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  GuardedOperationError,
  assertWorkspaceTrusted,
  confirmRiskyOperation,
  resolveGuardedPath,
  runGuardedOperation
} from '../../src/security/guardedOperations';
import { window, workspace } from './vscodeMock';

describe('guarded operations (#399)', () => {
  let wsRoot: string;

  beforeEach(() => {
    jest.clearAllMocks();
    workspace.isTrusted = true;
    wsRoot = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-guard-'))
    );
  });

  afterEach(() => {
    fs.rmSync(wsRoot, { recursive: true, force: true });
  });

  describe('assertWorkspaceTrusted', () => {
    it('passes in a trusted workspace', () => {
      expect(() => assertWorkspaceTrusted('Export')).not.toThrow();
    });

    it('throws an untrusted error in Restricted Mode', () => {
      workspace.isTrusted = false;
      try {
        assertWorkspaceTrusted('Export');
        throw new Error('expected throw');
      } catch (error) {
        expect(error).toBeInstanceOf(GuardedOperationError);
        expect((error as GuardedOperationError).code).toBe('untrusted');
      }
    });
  });

  describe('resolveGuardedPath', () => {
    it('returns a resolved path that stays inside the workspace', () => {
      const safe = resolveGuardedPath({
        requestedPath: 'fab/out',
        workspaceRoot: wsRoot,
        label: 'Output directory'
      });
      expect(safe).toBe(path.resolve(wsRoot, 'fab/out'));
    });

    it('rejects parent-directory traversal', () => {
      expect(() =>
        resolveGuardedPath({
          requestedPath: '../escape',
          workspaceRoot: wsRoot,
          label: 'Output directory'
        })
      ).toThrow(GuardedOperationError);
    });

    it('rejects an absolute path outside the workspace', () => {
      const outside = fs.realpathSync.native(os.tmpdir());
      try {
        resolveGuardedPath({
          requestedPath: path.join(outside, 'elsewhere'),
          workspaceRoot: wsRoot
        });
        throw new Error('expected throw');
      } catch (error) {
        expect(error).toBeInstanceOf(GuardedOperationError);
        expect((error as GuardedOperationError).code).toBe('path-escape');
      }
    });

    it('rejects a symlink that escapes the workspace', () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-out-'));
      const link = path.join(wsRoot, 'link');
      try {
        fs.symlinkSync(outsideDir, link, 'dir');
      } catch {
        // Symlink creation can require privileges (e.g. Windows); the
        // canonicalization behavior is covered by the traversal cases above.
        fs.rmSync(outsideDir, { recursive: true, force: true });
        return;
      }
      try {
        expect(() =>
          resolveGuardedPath({
            requestedPath: 'link/file.gbr',
            workspaceRoot: wsRoot
          })
        ).toThrow(GuardedOperationError);
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('throws a no-workspace error when no root is available', () => {
      const wsMock = workspace as unknown as { workspaceFolders: unknown };
      const previous = wsMock.workspaceFolders;
      wsMock.workspaceFolders = undefined;
      try {
        resolveGuardedPath({ requestedPath: 'fab' });
        throw new Error('expected throw');
      } catch (error) {
        expect(error).toBeInstanceOf(GuardedOperationError);
        expect((error as GuardedOperationError).code).toBe('no-workspace');
      } finally {
        wsMock.workspaceFolders = previous;
      }
    });
  });

  describe('confirmRiskyOperation', () => {
    it('returns true when the user confirms', async () => {
      (window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Proceed');
      await expect(
        confirmRiskyOperation({
          message: 'Overwrite?',
          confirmLabel: 'Proceed'
        })
      ).resolves.toBe(true);
    });

    it('returns false when the user dismisses', async () => {
      (window.showWarningMessage as jest.Mock).mockResolvedValueOnce(undefined);
      await expect(
        confirmRiskyOperation({
          message: 'Overwrite?',
          confirmLabel: 'Proceed'
        })
      ).resolves.toBe(false);
    });
  });

  describe('runGuardedOperation', () => {
    it('runs the action when all guards pass', async () => {
      const action = jest.fn().mockResolvedValue('done');
      const result = await runGuardedOperation(
        {
          feature: 'Export',
          kind: 'export',
          outputPath: { requestedPath: 'fab', workspaceRoot: wsRoot }
        },
        action
      );
      expect(result.outcome).toBe('completed');
      expect(result.value).toBe('done');
      expect(result.safePath).toBe(path.resolve(wsRoot, 'fab'));
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('refuses to run in Restricted Mode', async () => {
      workspace.isTrusted = false;
      const action = jest.fn();
      await expect(
        runGuardedOperation({ feature: 'Export', kind: 'export' }, action)
      ).rejects.toBeInstanceOf(GuardedOperationError);
      expect(action).not.toHaveBeenCalled();
    });

    it('previews without executing on dry-run', async () => {
      const action = jest.fn();
      const result = await runGuardedOperation(
        {
          feature: 'Export',
          kind: 'export',
          dryRun: true,
          outputPath: { requestedPath: 'fab', workspaceRoot: wsRoot }
        },
        action
      );
      expect(result.outcome).toBe('dry-run');
      expect(result.safePath).toBe(path.resolve(wsRoot, 'fab'));
      expect(action).not.toHaveBeenCalled();
    });

    it('cancels when the confirmation is declined', async () => {
      (window.showWarningMessage as jest.Mock).mockResolvedValueOnce(undefined);
      const action = jest.fn();
      const result = await runGuardedOperation(
        {
          feature: 'Export',
          kind: 'manufacturing',
          confirm: { message: 'Overwrite?', confirmLabel: 'Proceed' }
        },
        action
      );
      expect(result.outcome).toBe('cancelled');
      expect(action).not.toHaveBeenCalled();
    });

    it('runs after the confirmation is accepted', async () => {
      (window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Proceed');
      const action = jest.fn().mockResolvedValue(undefined);
      const result = await runGuardedOperation(
        {
          feature: 'Export',
          kind: 'manufacturing',
          confirm: { message: 'Overwrite?', confirmLabel: 'Proceed' }
        },
        action
      );
      expect(result.outcome).toBe('completed');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('rejects an escaping output path before running the action', async () => {
      const action = jest.fn();
      await expect(
        runGuardedOperation(
          {
            feature: 'Export',
            kind: 'export',
            outputPath: { requestedPath: '../escape', workspaceRoot: wsRoot }
          },
          action
        )
      ).rejects.toBeInstanceOf(GuardedOperationError);
      expect(action).not.toHaveBeenCalled();
    });

    it('can skip the trust gate for read-only previews', async () => {
      workspace.isTrusted = false;
      const action = jest.fn().mockResolvedValue('ok');
      const result = await runGuardedOperation(
        { feature: 'Preview', kind: 'write', requireTrust: false },
        action
      );
      expect(result.outcome).toBe('completed');
      expect(action).toHaveBeenCalledTimes(1);
    });
  });
});
