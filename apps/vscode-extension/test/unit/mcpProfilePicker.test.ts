import * as fs from 'node:fs';
import {
  pickMcpProfile,
  readConfiguredMcpProfile
} from '../../src/commands/mcpProfilePicker';
import { KICAD_MCP_PROFILES } from '../../src/mcp/profileCatalog';
import { __setConfiguration, window, workspace } from './vscodeMock';

jest.mock('node:fs', () => ({
  ...jest.requireActual<typeof import('node:fs')>('node:fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}));

const existsSync = fs.existsSync as jest.Mock;
const readFileSync = fs.readFileSync as jest.Mock;
const writeFileSync = fs.writeFileSync as jest.Mock;

describe('mcpProfilePicker', () => {
  const firstProfile = KICAD_MCP_PROFILES[0];

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    existsSync.mockReturnValue(false);
    __setConfiguration({});
    (workspace as { workspaceFolders?: unknown }).workspaceFolders = [
      { uri: { fsPath: '/workspace' } }
    ];
  });

  function services() {
    return {
      mcpClient: { retryNow: jest.fn().mockResolvedValue(undefined) },
      refreshMcpState: jest.fn().mockResolvedValue(undefined)
    };
  }

  describe('pickMcpProfile', () => {
    it('returns undefined and writes nothing when the quick pick is dismissed', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
      const svc = services();

      const result = await pickMcpProfile(svc as never);

      expect(result).toBeUndefined();
      expect(writeFileSync).not.toHaveBeenCalled();
      expect(svc.refreshMcpState).not.toHaveBeenCalled();
    });

    it('writes via configuration and restarts when the user confirms', async () => {
      existsSync.mockReturnValue(false); // no mcp.json -> config path
      const update = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(workspace, 'getConfiguration').mockReturnValue({
        get: () => 'full',
        inspect: () => undefined,
        update
      } as never);
      (window.showQuickPick as jest.Mock).mockResolvedValue({
        profile: firstProfile
      });
      (window.showInformationMessage as jest.Mock).mockResolvedValue('Restart');

      const svc = services();
      const result = await pickMcpProfile(svc as never);

      expect(result).toBe(firstProfile.id);
      expect(update).toHaveBeenCalledWith(
        expect.any(String),
        firstProfile.id,
        expect.anything()
      );
      expect(svc.mcpClient.retryNow).toHaveBeenCalled();
      expect(svc.refreshMcpState).toHaveBeenCalled();
    });

    it('does not restart when the user defers', async () => {
      existsSync.mockReturnValue(false);
      jest.spyOn(workspace, 'getConfiguration').mockReturnValue({
        get: () => 'full',
        inspect: () => undefined,
        update: jest.fn()
      } as never);
      (window.showQuickPick as jest.Mock).mockResolvedValue({
        profile: firstProfile
      });
      (window.showInformationMessage as jest.Mock).mockResolvedValue('Later');

      const svc = services();
      const result = await pickMcpProfile(svc as never);

      expect(result).toBe(firstProfile.id);
      expect(svc.mcpClient.retryNow).not.toHaveBeenCalled();
      expect(svc.refreshMcpState).not.toHaveBeenCalled();
    });

    it('writes the profile into an existing mcp.json', async () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('{}');
      (window.showQuickPick as jest.Mock).mockResolvedValue({
        profile: firstProfile
      });
      (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

      await pickMcpProfile(services() as never);

      expect(writeFileSync).toHaveBeenCalled();
      const written = String(writeFileSync.mock.calls[0]?.[1]);
      expect(written).toContain('KICAD_MCP_PROFILE');
      expect(written).toContain(firstProfile.id);
    });
  });

  describe('readConfiguredMcpProfile', () => {
    it('reads the profile from mcp.json when present', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(
        JSON.stringify({
          servers: { kicad: { env: { KICAD_MCP_PROFILE: 'analysis' } } }
        })
      );

      expect(readConfiguredMcpProfile()).toBe('analysis');
    });

    it('falls back to the configuration setting when mcp.json is absent', () => {
      existsSync.mockReturnValue(false);
      __setConfiguration({ 'kicadstudio.mcp.profile': 'manufacturing' });

      expect(readConfiguredMcpProfile()).toBe('manufacturing');
    });

    it('returns the full default when nothing is configured', () => {
      existsSync.mockReturnValue(false);
      __setConfiguration({});

      expect(readConfiguredMcpProfile()).toBe('full');
    });

    it('ignores an unparseable mcp.json and falls back to configuration', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('{ not json');
      __setConfiguration({ 'kicadstudio.mcp.profile': 'analysis' });

      expect(readConfiguredMcpProfile()).toBe('analysis');
    });
  });
});
