import {
  CLOUD_CLIENT_ID,
  CLOUD_ORIGIN,
  CLOUD_RESOURCE,
  CLOUD_PROTOCOL_VERSION,
  CloudUnauthorizedError,
  CloudPermissionError,
  callbackUriForScheme,
  createAuthorizationRequest,
  discoverCloudOAuth,
  listCloudInventory,
  redeemCloudCode,
  refreshCloudToken,
  type CloudTokens
} from '../../src/mcp/cloudOAuthContract';
import { createHash } from 'node:crypto';

const callback = 'vscode://oaslananka.kicadstudiokit/cloud-auth';
const oauth = {
  issuer: `${CLOUD_ORIGIN}/api/auth`,
  authorization_endpoint: `${CLOUD_ORIGIN}/api/auth/oauth2/authorize`,
  token_endpoint: `${CLOUD_ORIGIN}/api/auth/oauth2/token`,
  client_id_metadata_document_supported: true,
  code_challenge_methods_supported: ['S256'],
  scopes_supported: ['openid', 'profile', 'offline_access', 'projects:read']
};
const client = {
  client_id: CLOUD_CLIENT_ID,
  token_endpoint_auth_method: 'none',
  redirect_uris: [
    callback,
    'vscode-insiders://oaslananka.kicadstudiokit/cloud-auth'
  ]
};

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function discoveryFetch(
  overrides: {
    oauth?: unknown;
    protected?: unknown;
    client?: unknown;
    clientStatus?: number;
  } = {}
): typeof fetch {
  return jest.fn(async (input: string | URL | Request) => {
    const uri = String(input);
    if (uri.endsWith('/.well-known/oauth-protected-resource')) {
      return response(
        overrides.protected ?? {
          resource: CLOUD_RESOURCE,
          authorization_servers: [`${CLOUD_ORIGIN}/api/auth`]
        }
      );
    }
    if (uri.endsWith('/.well-known/oauth-authorization-server/api/auth')) {
      return response(overrides.oauth ?? oauth);
    }
    if (uri === CLOUD_CLIENT_ID) {
      return response(
        overrides.client ?? client,
        overrides.clientStatus ?? 200
      );
    }
    throw new Error('Unexpected URL');
  }) as unknown as typeof fetch;
}

describe('Studio Cloud OAuth contracts', () => {
  it('rejects unregistered VS Code schemes', () => {
    expect(callbackUriForScheme('vscode')).toBe(callback);
    expect(callbackUriForScheme('vscode-insiders')).toMatch(
      /^vscode-insiders:/u
    );
    expect(() => callbackUriForScheme('https')).toThrow('desktop URI handler');
  });

  it('verifies all deployed discovery documents before opening a browser', async () => {
    const fetcher = discoveryFetch();
    const data = await discoverCloudOAuth(callback, fetcher);
    expect(data.issuer).toBe(oauth.issuer);
    expect(data.tokenEndpoint).toBe(oauth.token_endpoint);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('fails closed for malicious issuer, mismatched resource and absent client metadata', async () => {
    await expect(
      discoverCloudOAuth(
        callback,
        discoveryFetch({ oauth: { ...oauth, issuer: 'https://evil.invalid' } })
      )
    ).rejects.toThrow('incompatible');
    await expect(
      discoverCloudOAuth(
        callback,
        discoveryFetch({ protected: { resource: 'https://evil.invalid' } })
      )
    ).rejects.toThrow('incompatible');
    await expect(
      discoverCloudOAuth(callback, discoveryFetch({ clientStatus: 404 }))
    ).rejects.toThrow('unavailable');
  });

  it('refuses OAuth client metadata that omits the exact callback or public token method', async () => {
    await expect(
      discoverCloudOAuth(
        callback,
        discoveryFetch({
          client: { ...client, redirect_uris: ['https://wrong.invalid'] }
        })
      )
    ).rejects.toThrow('not been published');
    await expect(
      discoverCloudOAuth(
        callback,
        discoveryFetch({
          client: {
            ...client,
            token_endpoint_auth_method: 'client_secret_basic'
          }
        })
      )
    ).rejects.toThrow('not been published');
  });

  it('builds random state and SHA256 PKCE challenge with read-only resource', () => {
    const md = {
      issuer: oauth.issuer,
      authorizationEndpoint: oauth.authorization_endpoint,
      tokenEndpoint: oauth.token_endpoint
    };
    const a = createAuthorizationRequest(md, callback);
    const b = createAuthorizationRequest(md, callback);
    const params = new URL(a.url).searchParams;
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
    expect(params.get('resource')).toBe(CLOUD_RESOURCE);
    expect(params.get('client_id')).toBe(CLOUD_CLIENT_ID);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('scope')).toContain('projects:read');
    expect(params.get('code_challenge')).toBe(
      createHash('sha256').update(a.verifier).digest('base64url')
    );
  });

  it('exchanges a code without a client secret and stores a bounded token lifetime', async () => {
    const fetcher = jest.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const params = new URLSearchParams(String(init?.body));
        expect(params.get('client_secret')).toBeNull();
        expect(params.get('code')).toBe('CODE');
        expect(params.get('resource')).toBe(CLOUD_RESOURCE);
        return response({
          access_token: 'ACCESS',
          refresh_token: 'REFRESH',
          token_type: 'Bearer',
          scope: 'projects:read',
          expires_in: 3600
        });
      }
    ) as unknown as typeof fetch;
    const tokens = await redeemCloudCode(
      {
        issuer: oauth.issuer,
        tokenEndpoint: oauth.token_endpoint,
        authorizationEndpoint: oauth.authorization_endpoint
      },
      'CODE',
      'verifier',
      callback,
      fetcher
    );
    expect(tokens.accessToken).toBe('ACCESS');
    expect(tokens.refreshToken).toBe('REFRESH');
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rotates a refresh token without sharing it with an unauthorized host', async () => {
    const previous: CloudTokens = {
      accessToken: 'OLD',
      refreshToken: 'REFRESH',
      expiresAt: 1,
      scope: 'projects:read'
    };
    const fetcher = jest.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        expect(url).toBe(oauth.token_endpoint);
        const params = new URLSearchParams(String(init?.body));
        expect(params.get('grant_type')).toBe('refresh_token');
        expect(params.get('refresh_token')).toBe('REFRESH');
        return response({
          access_token: 'NEW',
          refresh_token: 'ROTATED',
          token_type: 'bearer',
          expires_in: 600,
          scope: 'projects:read'
        });
      }
    ) as unknown as typeof fetch;
    expect(
      (
        await refreshCloudToken(
          {
            issuer: oauth.issuer,
            tokenEndpoint: oauth.token_endpoint,
            authorizationEndpoint: oauth.authorization_endpoint
          },
          previous,
          fetcher
        )
      ).refreshToken
    ).toBe('ROTATED');
    await expect(
      refreshCloudToken(
        {
          issuer: oauth.issuer,
          tokenEndpoint: oauth.token_endpoint,
          authorizationEndpoint: oauth.authorization_endpoint
        },
        {
          accessToken: previous.accessToken,
          expiresAt: previous.expiresAt,
          scope: previous.scope
        },
        fetcher
      )
    ).rejects.toBeInstanceOf(CloudUnauthorizedError);
  });

  it('discovers only explicitly granted project aliases with offline status', async () => {
    const tokens: CloudTokens = {
      accessToken: 'ACCESS',
      expiresAt: Date.now() + 60000,
      scope: 'projects:read'
    };
    const fetcher = jest.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(input).toBe(CLOUD_RESOURCE);
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer ACCESS'
        );
        const req = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const params = req['params'] as Record<string, unknown>;
        if (req['method'] === 'initialize') {
          return response({
            jsonrpc: '2.0',
            id: req['id'],
            result: {
              protocolVersion: CLOUD_PROTOCOL_VERSION,
              capabilities: {}
            }
          });
        }
        const name = params['name'];
        return response({
          jsonrpc: '2.0',
          id: req['id'],
          result: {
            structuredContent:
              name === 'list_devices'
                ? { devices: [{ id: 'd1', alias: 'Laptop', connected: false }] }
                : {
                    projects: [
                      {
                        id: 'p1',
                        alias: 'Demo PCB',
                        deviceId: 'd1',
                        connectorConnected: false,
                        available: false,
                        reason: 'device_not_connected'
                      }
                    ]
                  }
          }
        });
      }
    ) as unknown as typeof fetch;
    const inventory = await listCloudInventory(tokens, fetcher);
    expect(inventory.devices).toEqual([
      { id: 'd1', name: 'Laptop', connected: false }
    ]);
    expect(inventory.projects).toEqual([
      {
        id: 'p1',
        alias: 'Demo PCB',
        deviceId: 'd1',
        connectorConnected: false,
        available: false,
        reason: 'device_not_connected'
      }
    ]);
  });

  it('rejects a revoked token and an incompatible MCP protocol', async () => {
    const tokens: CloudTokens = {
      accessToken: 'ACCESS',
      expiresAt: Date.now() + 60000,
      scope: 'projects:read'
    };
    await expect(
      listCloudInventory(
        tokens,
        jest.fn(async () => response({}, 401)) as unknown as typeof fetch
      )
    ).rejects.toBeInstanceOf(CloudUnauthorizedError);
    await expect(
      listCloudInventory(
        tokens,
        jest.fn(async () => response({}, 403)) as unknown as typeof fetch
      )
    ).rejects.toBeInstanceOf(CloudPermissionError);
    await expect(
      listCloudInventory(
        tokens,
        jest.fn(async () =>
          response({
            jsonrpc: '2.0',
            id: 1,
            result: { protocolVersion: '2025-03-26' }
          })
        ) as unknown as typeof fetch
      )
    ).rejects.toThrow('protocol version');
  });
});
