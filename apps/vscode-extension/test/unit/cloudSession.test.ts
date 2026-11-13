import * as vscode from 'vscode';
import { createExtensionContextMock, env, window } from './vscodeMock';
import { CloudSessionController } from '../../src/mcp/cloudSession';
import * as contract from '../../src/mcp/cloudOAuthContract';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});
jest.mock('../../src/mcp/cloudOAuthContract', () => ({
  ...jest.requireActual('../../src/mcp/cloudOAuthContract'),
  discoverCloudOAuth: jest.fn(),
  createAuthorizationRequest: jest.fn(),
  redeemCloudCode: jest.fn(),
  refreshCloudToken: jest.fn(),
  listCloudInventory: jest.fn()
}));

const discovery = {
  issuer: 'https://kicad-mcp-pro.oaslananka.dev/api/auth',
  authorizationEndpoint:
    'https://kicad-mcp-pro.oaslananka.dev/api/auth/oauth2/authorize',
  tokenEndpoint: 'https://kicad-mcp-pro.oaslananka.dev/api/auth/oauth2/token'
};
const tokens = {
  accessToken: 'ACCESS',
  refreshToken: 'REFRESH',
  expiresAt: Date.now() + 600000,
  scope: 'projects:read'
};

describe('Cloud session lifecycle (VS Code SecretStorage only)', () => {
  let context: ReturnType<typeof createExtensionContextMock>;
  let handler: { handleUri(uri: vscode.Uri): void };
  let controller: CloudSessionController;

  beforeEach(() => {
    jest.clearAllMocks();
    context = createExtensionContextMock();
    Object.assign(env, { uriScheme: 'vscode' });
    Object.assign(window, {
      registerUriHandler: jest.fn((value) => {
        handler = value;
        return { dispose: jest.fn() };
      })
    });
    (env.openExternal as jest.Mock).mockResolvedValue(true);
    (contract.discoverCloudOAuth as jest.Mock).mockResolvedValue(discovery);
    (contract.createAuthorizationRequest as jest.Mock).mockReturnValue({
      state: 'random-state',
      verifier: 'random-verifier',
      url: 'https://kicad-mcp-pro.oaslananka.dev/authorize?state=random-state'
    });
    (contract.redeemCloudCode as jest.Mock).mockResolvedValue(tokens);
    controller = new CloudSessionController(
      context as unknown as vscode.ExtensionContext
    );
  });

  afterEach(() => controller.dispose());

  it('does not connect, pair devices or read secrets automatically on activation', async () => {
    expect(
      (window as unknown as { registerUriHandler: jest.Mock })
        .registerUriHandler
    ).toHaveBeenCalledTimes(1);
    expect(env.openExternal).not.toHaveBeenCalled();
    expect(context.secrets.get).not.toHaveBeenCalled();
    expect(await controller.isSignedIn()).toBe(false);
    expect(env.openExternal).not.toHaveBeenCalled();
  });

  it('rejects an unsolicited callback and accepts only matching state and issuer', async () => {
    const login = controller.signIn();
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    handler.handleUri({
      scheme: 'vscode',
      authority: 'oaslananka.kicadstudiokit',
      path: '/cloud-auth',
      query: 'state=wrong&code=ATTACKER'
    } as vscode.Uri);
    expect(contract.redeemCloudCode).not.toHaveBeenCalled();
    handler.handleUri({
      scheme: 'vscode',
      authority: 'oaslananka.kicadstudiokit',
      path: '/cloud-auth',
      query:
        'state=random-state&iss=https%3A%2F%2Fkicad-mcp-pro.oaslananka.dev%2Fapi%2Fauth&code=CORRECT'
    } as vscode.Uri);
    await login;
    expect(contract.redeemCloudCode).toHaveBeenCalledWith(
      discovery,
      'CORRECT',
      'random-verifier',
      'vscode://oaslananka.kicadstudiokit/cloud-auth'
    );
    expect(await controller.isSignedIn()).toBe(true);
    expect(context.secrets.store).toHaveBeenCalledWith(
      'kicadstudio.cloud.oauth.session.v1',
      JSON.stringify(tokens)
    );
    expect(context.globalState.update).not.toHaveBeenCalled();
  });

  it('keeps remote project identity out of the local project and clears both on logout', async () => {
    await context.secrets.store(
      'kicadstudio.cloud.oauth.session.v1',
      JSON.stringify(tokens)
    );
    (contract.listCloudInventory as jest.Mock).mockResolvedValue({
      devices: [{ id: 'device-1', name: 'Laptop', connected: false }],
      projects: [
        {
          id: 'project-1',
          alias: 'PCB',
          deviceId: 'device-1',
          connectorConnected: false,
          available: false
        }
      ]
    });
    const discovered = await controller.listAuthorizedProjects();
    expect(discovered.projects).toHaveLength(1);
    await controller.selectRemoteProject(discovered.projects[0]!);
    expect(context.globalState.update).toHaveBeenCalledWith(
      'kicadstudio.cloud.selectedRemoteProjectId',
      'project-1'
    );
    await controller.signOut();
    expect(await controller.isSignedIn()).toBe(false);
    expect(context.globalState.update).toHaveBeenCalledWith(
      'kicadstudio.cloud.selectedRemoteProjectId',
      undefined
    );
    expect(context.secrets.delete).toHaveBeenCalledWith(
      'kicadstudio.cloud.oauth.session.v1'
    );
  });

  it('discards revoked credentials without remote fallback or local workspace mutations', async () => {
    await context.secrets.store(
      'kicadstudio.cloud.oauth.session.v1',
      JSON.stringify({ ...tokens, expiresAt: 1 })
    );
    (contract.refreshCloudToken as jest.Mock).mockRejectedValue(
      new contract.CloudUnauthorizedError()
    );
    await expect(controller.listAuthorizedProjects()).rejects.toBeInstanceOf(
      contract.CloudUnauthorizedError
    );
    expect(context.secrets.delete).toHaveBeenCalledWith(
      'kicadstudio.cloud.oauth.session.v1'
    );
    expect(contract.listCloudInventory).not.toHaveBeenCalled();
  });
  it('drops corrupt persisted credentials rather than displaying a signed-in account', async () => {
    await context.secrets.store(
      'kicadstudio.cloud.oauth.session.v1',
      '<invalid>'
    );
    expect(await controller.isSignedIn()).toBe(false);
    expect(context.secrets.delete).toHaveBeenCalledWith(
      'kicadstudio.cloud.oauth.session.v1'
    );
  });

  it('refreshes an expiring session and passes the installed client version to MCP', async () => {
    await context.secrets.store(
      'kicadstudio.cloud.oauth.session.v1',
      JSON.stringify({ ...tokens, expiresAt: 1 })
    );
    const updated = {
      ...tokens,
      accessToken: 'ROTATED',
      expiresAt: Date.now() + 600000
    };
    (contract.refreshCloudToken as jest.Mock).mockResolvedValueOnce(updated);
    (contract.listCloudInventory as jest.Mock).mockResolvedValueOnce({
      devices: [],
      projects: []
    });
    await controller.listAuthorizedProjects();
    expect(contract.discoverCloudOAuth).toHaveBeenCalledTimes(1);
    expect(contract.refreshCloudToken).toHaveBeenCalledWith(discovery, {
      ...tokens,
      expiresAt: 1
    });
    expect(context.secrets.store).toHaveBeenCalledWith(
      'kicadstudio.cloud.oauth.session.v1',
      JSON.stringify(updated)
    );
    expect(contract.listCloudInventory).toHaveBeenCalledWith(
      updated,
      expect.any(Function),
      '2.8.1'
    );
  });

  it('retries a single unauthorized Cloud inventory call after refresh', async () => {
    await context.secrets.store(
      'kicadstudio.cloud.oauth.session.v1',
      JSON.stringify(tokens)
    );
    const updated = { ...tokens, accessToken: 'ROTATED' };
    (contract.refreshCloudToken as jest.Mock).mockResolvedValueOnce(updated);
    (contract.listCloudInventory as jest.Mock)
      .mockRejectedValueOnce(new contract.CloudUnauthorizedError())
      .mockResolvedValueOnce({ devices: [], projects: [] });
    expect(await controller.listAuthorizedProjects()).toEqual({
      devices: [],
      projects: []
    });
    expect(contract.listCloudInventory).toHaveBeenCalledTimes(2);
    expect(contract.refreshCloudToken).toHaveBeenCalledTimes(1);
    expect(context.secrets.delete).not.toHaveBeenCalled();
  });

  it('clears revoked credentials if the refreshed Cloud request is still unauthorized', async () => {
    await context.secrets.store(
      'kicadstudio.cloud.oauth.session.v1',
      JSON.stringify(tokens)
    );
    (contract.refreshCloudToken as jest.Mock).mockResolvedValueOnce(tokens);
    (contract.listCloudInventory as jest.Mock)
      .mockRejectedValueOnce(new contract.CloudUnauthorizedError())
      .mockRejectedValueOnce(new contract.CloudUnauthorizedError());
    await expect(controller.listAuthorizedProjects()).rejects.toBeInstanceOf(
      contract.CloudUnauthorizedError
    );
    expect(contract.listCloudInventory).toHaveBeenCalledTimes(2);
    expect(context.secrets.delete).toHaveBeenCalledWith(
      'kicadstudio.cloud.oauth.session.v1'
    );
  });

  it('ignores an unrelated VS Code URI but fails on an OAuth issuer mismatch', async () => {
    const login = controller.signIn();
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    handler.handleUri({
      scheme: 'vscode',
      authority: 'unrelated.extension',
      path: '/cloud-auth',
      query: 'state=random-state&code=attacker'
    } as vscode.Uri);
    expect(contract.redeemCloudCode).not.toHaveBeenCalled();
    handler.handleUri({
      scheme: 'vscode',
      authority: 'oaslananka.kicadstudiokit',
      path: '/cloud-auth',
      query: 'state=random-state&iss=https%3A%2F%2Fevil.invalid&code=attacker'
    } as vscode.Uri);
    await expect(login).rejects.toThrow('unexpected authorization issuer');
    expect(context.secrets.store).not.toHaveBeenCalled();
  });

  it('does not keep a pending session when VS Code cannot launch the browser', async () => {
    (env.openExternal as jest.Mock).mockResolvedValueOnce(false);
    await expect(controller.signIn()).rejects.toThrow(
      'could not open the Cloud sign-in browser'
    );
    expect(context.secrets.store).not.toHaveBeenCalled();
  });

  it('stops an explicit OAuth denial and leaves no login credentials', async () => {
    const login = controller.signIn();
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    handler.handleUri({
      scheme: 'vscode',
      authority: 'oaslananka.kicadstudiokit',
      path: '/cloud-auth',
      query: 'state=random-state&error=access_denied'
    } as vscode.Uri);
    await expect(login).rejects.toThrow('cancelled or denied');
    expect(context.secrets.store).not.toHaveBeenCalled();
  });
});
