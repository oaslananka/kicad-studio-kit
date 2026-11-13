import { COMMANDS } from '../../src/constants';
import {
  CloudPermissionError,
  CloudUnauthorizedError
} from '../../src/mcp/cloudOAuthContract';
import { registerCloudCommands } from '../../src/commands/cloudCommands';
import {
  commands,
  createExtensionContextMock,
  env,
  window
} from './vscodeMock';
import * as vscode from 'vscode';

const mockCloud = {
  isSignedIn: jest.fn(),
  signIn: jest.fn(),
  listAuthorizedProjects: jest.fn(),
  selectRemoteProject: jest.fn(),
  signOut: jest.fn(),
  dispose: jest.fn()
};

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});
jest.mock('../../src/mcp/cloudSession', () => ({
  CloudSessionController: jest.fn().mockImplementation(() => mockCloud),
  cloudManageAccessUri: jest.fn(() => ({
    fsPath: 'https://kicad-mcp-pro.oaslananka.dev/devices'
  }))
}));

const offlineProject = {
  id: 'project-1',
  alias: 'Demo PCB',
  deviceId: 'device-1',
  connectorConnected: false,
  available: false,
  reason: 'device_not_connected'
};

function handler(commandId: string): () => Promise<void> {
  const matching = (commands.registerCommand as jest.Mock).mock.calls.find(
    ([id]: [string]) => id === commandId
  );
  if (!matching) throw new Error('Cloud command not registered: ' + commandId);
  return matching[1];
}

describe('optional Cloud account commands (local-first)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCloud.isSignedIn.mockReset();
    const context = createExtensionContextMock();
    mockCloud.isSignedIn.mockResolvedValue(true);
    mockCloud.signIn.mockResolvedValue(undefined);
    mockCloud.signOut.mockResolvedValue(undefined);
    mockCloud.selectRemoteProject.mockResolvedValue(undefined);
    mockCloud.listAuthorizedProjects.mockResolvedValue({
      devices: [],
      projects: []
    });
    (env.openExternal as jest.Mock).mockResolvedValue(true);
    registerCloudCommands(context as unknown as vscode.ExtensionContext);
  });

  it('registers exactly three optional entry points without auto-login or pairing', () => {
    for (const command of [
      COMMANDS.cloudSignIn,
      COMMANDS.cloudProjects,
      COMMANDS.cloudSignOut
    ]) {
      expect(commands.registerCommand).toHaveBeenCalledWith(
        command,
        expect.any(Function)
      );
    }
    expect(commands.registerCommand).toHaveBeenCalledTimes(3);
    expect(mockCloud.signIn).not.toHaveBeenCalled();
    expect(mockCloud.listAuthorizedProjects).not.toHaveBeenCalled();
  });

  it('first-time login opens account authorization then shows a truthful empty inventory', async () => {
    mockCloud.isSignedIn.mockResolvedValueOnce(false);
    await handler(COMMANDS.cloudSignIn)();
    expect(mockCloud.isSignedIn).toHaveBeenCalledTimes(2);
    expect(mockCloud.signIn).toHaveBeenCalledTimes(1);
    expect(mockCloud.listAuthorizedProjects).toHaveBeenCalledTimes(1);
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No devices or projects are authorized'),
      'Manage Cloud Access'
    );
    expect(mockCloud.selectRemoteProject).not.toHaveBeenCalled();
  });

  it('explains a first-time signed-out Cloud choice without claiming expired credentials', async () => {
    mockCloud.isSignedIn.mockResolvedValueOnce(false);
    (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      undefined
    );
    await handler(COMMANDS.cloudProjects)();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('without a Cloud account'),
      'Sign in to Cloud',
      'Cancel'
    );
    expect(window.showWarningMessage).not.toHaveBeenCalled();
    expect(mockCloud.listAuthorizedProjects).not.toHaveBeenCalled();
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('begins Cloud authorization only after a signed-out user chooses Sign in', async () => {
    mockCloud.isSignedIn.mockResolvedValueOnce(false);
    (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      'Sign in to Cloud'
    );
    await handler(COMMANDS.cloudProjects)();
    expect(commands.executeCommand).toHaveBeenCalledWith(COMMANDS.cloudSignIn);
    expect(mockCloud.listAuthorizedProjects).not.toHaveBeenCalled();
  });

  it('does not redundantly sign in when an account session is already stored', async () => {
    mockCloud.isSignedIn.mockResolvedValueOnce(true);
    await handler(COMMANDS.cloudSignIn)();
    expect(mockCloud.signIn).not.toHaveBeenCalled();
    expect(mockCloud.listAuthorizedProjects).toHaveBeenCalledTimes(1);
  });

  it('shows a permission-management action when a device has no granted projects', async () => {
    mockCloud.listAuthorizedProjects.mockResolvedValueOnce({
      devices: [{ id: 'device-1', name: 'Laptop', connected: false }],
      projects: []
    });
    (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      'Manage Cloud Access'
    );
    await handler(COMMANDS.cloudProjects)();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No projects are granted'),
      'Manage Cloud Access'
    );
    expect(env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: 'https://kicad-mcp-pro.oaslananka.dev/devices'
      })
    );
  });

  it('makes offline or ungranted projects selectable as aliases without implying remote edit', async () => {
    mockCloud.listAuthorizedProjects.mockResolvedValueOnce({
      devices: [{ id: 'device-1', name: 'Laptop', connected: false }],
      projects: [offlineProject]
    });
    (window.showQuickPick as jest.Mock).mockImplementationOnce(
      async (items) => {
        expect(items).toEqual([
          expect.objectContaining({
            label: '$(circuit-board) Demo PCB',
            description: 'Laptop - Device offline - Connector offline',
            detail: 'Reconnect this device in Cloud before remote operations',
            project: offlineProject
          }),
          expect.objectContaining({
            label: '$(shield) Manage Cloud Access',
            manageAccess: true
          })
        ]);
        return items[0];
      }
    );
    await handler(COMMANDS.cloudProjects)();
    expect(mockCloud.selectRemoteProject).toHaveBeenCalledWith(offlineProject);
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No local design was changed'),
      'Manage Cloud Access'
    );
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('reports an online connector distinctly from an authorized remote design operation', async () => {
    mockCloud.listAuthorizedProjects.mockResolvedValueOnce({
      devices: [{ id: 'device-1', name: 'Desktop', connected: true }],
      projects: [
        {
          ...offlineProject,
          connectorConnected: true,
          available: false,
          reason: 'cloud_read_not_enabled'
        },
        { ...offlineProject, id: 'project-2', available: true }
      ]
    });
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
    await handler(COMMANDS.cloudProjects)();
    expect(window.showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          description: 'Desktop - Device online - Connector online',
          detail: 'Cloud read access is disabled for this project'
        }),
        expect.objectContaining({
          detail: 'Connector offline - check device and Cloud permissions'
        }),
        expect.objectContaining({
          label: '$(shield) Manage Cloud Access',
          manageAccess: true
        })
      ],
      expect.objectContaining({
        matchOnDescription: true,
        matchOnDetail: true
      })
    );
    expect(mockCloud.selectRemoteProject).not.toHaveBeenCalled();
  });

  it('offers direct Cloud grant management without selecting or mutating a local project', async () => {
    mockCloud.listAuthorizedProjects.mockResolvedValueOnce({
      devices: [],
      projects: [offlineProject]
    });
    (window.showQuickPick as jest.Mock).mockImplementationOnce(async (items) =>
      items.find((item: { manageAccess?: boolean }) => item.manageAccess)
    );
    await handler(COMMANDS.cloudProjects)();
    expect(env.openExternal).toHaveBeenCalledTimes(1);
    expect(mockCloud.selectRemoteProject).not.toHaveBeenCalled();
  });

  it('takes a permission-denied account directly to grant management, not re-login', async () => {
    mockCloud.listAuthorizedProjects.mockRejectedValueOnce(
      new CloudPermissionError()
    );
    (window.showWarningMessage as jest.Mock).mockResolvedValueOnce(
      'Manage Cloud Access'
    );
    await handler(COMMANDS.cloudProjects)();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Cloud access was denied'),
      'Manage Cloud Access',
      'Cancel'
    );
    expect(env.openExternal).toHaveBeenCalledTimes(1);
    expect(commands.executeCommand).not.toHaveBeenCalledWith(
      COMMANDS.cloudSignIn
    );
  });

  it('does nothing when a user cancels selection or declines management', async () => {
    mockCloud.listAuthorizedProjects.mockResolvedValueOnce({
      devices: [],
      projects: [offlineProject]
    });
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
    await handler(COMMANDS.cloudProjects)();
    expect(mockCloud.selectRemoteProject).not.toHaveBeenCalled();
    expect(env.openExternal).not.toHaveBeenCalled();
  });

  it('opens Cloud access only after the user requests management from a selected project', async () => {
    mockCloud.listAuthorizedProjects.mockResolvedValueOnce({
      devices: [],
      projects: [offlineProject]
    });
    (window.showQuickPick as jest.Mock).mockResolvedValueOnce({
      label: 'Demo PCB',
      project: offlineProject
    });
    (window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
      'Manage Cloud Access'
    );
    await handler(COMMANDS.cloudProjects)();
    expect(env.openExternal).toHaveBeenCalledTimes(1);
  });

  it('does not silently retry expired or revoked credentials', async () => {
    mockCloud.listAuthorizedProjects.mockRejectedValueOnce(
      new CloudUnauthorizedError()
    );
    (window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Cancel');
    await handler(COMMANDS.cloudProjects)();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('expired or access was revoked'),
      'Sign in to Cloud',
      'Cancel'
    );
    expect(mockCloud.signIn).not.toHaveBeenCalled();
  });

  it('offers explicit reauthentication when a user chooses it after a Cloud error', async () => {
    mockCloud.listAuthorizedProjects.mockRejectedValueOnce(
      new Error('Connection interrupted.')
    );
    (window.showWarningMessage as jest.Mock).mockResolvedValueOnce(
      'Sign in to Cloud'
    );
    await handler(COMMANDS.cloudProjects)();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Connection interrupted.',
      'Sign in to Cloud',
      'Cancel'
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(COMMANDS.cloudSignIn);
  });

  it('handles unrecognized discovery failures without claiming an empty granted catalog', async () => {
    mockCloud.listAuthorizedProjects.mockRejectedValueOnce(null);
    await handler(COMMANDS.cloudProjects)();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Cloud is unavailable.',
      'Sign in to Cloud',
      'Cancel'
    );
  });

  it('surfaces login failure without leaking token or modifying local files', async () => {
    mockCloud.isSignedIn.mockResolvedValueOnce(false);
    mockCloud.signIn.mockRejectedValueOnce(
      new Error('OAuth metadata missing.')
    );
    await handler(COMMANDS.cloudSignIn)();
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'OAuth metadata missing.'
    );
    expect(mockCloud.listAuthorizedProjects).not.toHaveBeenCalled();
  });

  it('clears only the Studio Cloud session on sign out', async () => {
    await handler(COMMANDS.cloudSignOut)();
    expect(mockCloud.signOut).toHaveBeenCalledTimes(1);
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining(
        'device registrations and project files were not changed'
      )
    );
    expect(env.openExternal).not.toHaveBeenCalled();
  });
});
