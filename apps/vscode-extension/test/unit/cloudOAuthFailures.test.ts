import {
  CLOUD_CLIENT_ID,
  CLOUD_ORIGIN,
  CLOUD_PROTOCOL_VERSION,
  CLOUD_RESOURCE,
  CloudPermissionError,
  CloudUnauthorizedError,
  discoverCloudOAuth,
  redeemCloudCode,
  refreshCloudToken,
  listCloudInventory,
  type CloudTokens
} from '../../src/mcp/cloudOAuthContract';

const issuer = `${CLOUD_ORIGIN}/api/auth`;
const discovery = {
  issuer,
  authorizationEndpoint: `${issuer}/oauth2/authorize`,
  tokenEndpoint: `${issuer}/oauth2/token`
};
const sampleTokens: CloudTokens = {
  accessToken: 'secret-issued-by-server',
  refreshToken: 'rotating-server-token',
  expiresAt: Date.now() + 600000,
  scope: 'projects:read'
};

function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

function oauthMetadata(
  override: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    issuer,
    authorization_endpoint: discovery.authorizationEndpoint,
    token_endpoint: discovery.tokenEndpoint,
    client_id_metadata_document_supported: true,
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['projects:read'],
    ...override
  };
}

function metadataFetcher(
  options: {
    resource?: unknown;
    authorizationServers?: unknown;
    authorization?: unknown;
    client?: unknown;
  } = {}
): typeof fetch {
  return jest.fn(async (url: string | URL | Request) => {
    if (String(url).endsWith('/.well-known/oauth-protected-resource')) {
      return json(
        options.resource ?? {
          resource: CLOUD_RESOURCE,
          authorization_servers: options.authorizationServers ?? [issuer]
        }
      );
    }
    if (
      String(url).endsWith('/.well-known/oauth-authorization-server/api/auth')
    ) {
      return json(options.authorization ?? oauthMetadata());
    }
    if (String(url) === CLOUD_CLIENT_ID) {
      return json(
        options.client ?? {
          client_id: CLOUD_CLIENT_ID,
          token_endpoint_auth_method: 'none',
          redirect_uris: ['vscode://oaslananka.kicadstudiokit/cloud-auth']
        }
      );
    }
    throw new Error('Unknown URL');
  }) as unknown as typeof fetch;
}

function mcpFetcher(
  result: (
    method: string,
    name: string
  ) => { result?: unknown; error?: unknown },
  options: { status?: number; eventStream?: boolean; session?: boolean } = {}
): typeof fetch {
  return jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
      params: { name?: string };
    };
    if (options.status) return json({}, options.status);
    const output = {
      jsonrpc: '2.0',
      id: request.id,
      ...result(request.method, request.params.name ?? '')
    };
    const headers =
      options.session && request.method === 'initialize'
        ? { 'mcp-session-id': 'session-from-server' }
        : {};
    if (options.eventStream) {
      return new Response(
        `event: message\ndata: ${JSON.stringify(output)}\n\n`,
        {
          headers: { 'content-type': 'text/event-stream', ...headers }
        }
      );
    }
    return json(output, 200, headers);
  }) as unknown as typeof fetch;
}

function normalMcpResult(method: string, name: string): { result: unknown } {
  if (method === 'initialize') {
    return { result: { protocolVersion: CLOUD_PROTOCOL_VERSION } };
  }
  if (name === 'list_devices') {
    return { result: { structuredContent: { devices: [] } } };
  }
  return { result: { structuredContent: { projects: [] } } };
}

describe('Cloud malformed-response and safety boundary', () => {
  it.each([
    [
      'missing OAuth resource owner',
      { authorizationServers: [] },
      'did not match'
    ],
    [
      'missing PKCE methods',
      {
        authorization: oauthMetadata({ code_challenge_methods_supported: [] })
      },
      'does not support'
    ],
    [
      'missing read scope',
      { authorization: oauthMetadata({ scopes_supported: [] }) },
      'does not support'
    ],
    [
      'missing client metadata support',
      {
        authorization: oauthMetadata({
          client_id_metadata_document_supported: false
        })
      },
      'does not support'
    ],
    [
      'non-array redirect URI list',
      {
        client: {
          client_id: CLOUD_CLIENT_ID,
          token_endpoint_auth_method: 'none',
          redirect_uris: 'bad'
        }
      },
      'not been published'
    ],
    [
      'missing registered client identity',
      {
        client: {
          token_endpoint_auth_method: 'none',
          redirect_uris: ['vscode://oaslananka.kicadstudiokit/cloud-auth']
        }
      },
      'not been published'
    ],
    ['invalid discovery shape', { resource: [] }, 'Unexpected Cloud response']
  ])('rejects %s before OAuth begins', async (_case, options, expected) => {
    await expect(
      discoverCloudOAuth(
        'vscode://oaslananka.kicadstudiokit/cloud-auth',
        metadataFetcher(options)
      )
    ).rejects.toThrow(expected);
  });

  it('refuses oversized or non-JSON OAuth discovery without opening a browser', async () => {
    const tooLarge = jest.fn(
      async () =>
        new Response('{}', {
          headers: {
            'content-type': 'application/json',
            'content-length': '999999'
          }
        })
    ) as unknown as typeof fetch;
    await expect(
      discoverCloudOAuth(
        'vscode://oaslananka.kicadstudiokit/cloud-auth',
        tooLarge
      )
    ).rejects.toThrow('exceeds the supported size');
    const invalid = jest.fn(
      async () =>
        new Response('<!doctype html>', {
          headers: { 'content-type': 'text/html' }
        })
    ) as unknown as typeof fetch;
    await expect(
      discoverCloudOAuth(
        'vscode://oaslananka.kicadstudiokit/cloud-auth',
        invalid
      )
    ).rejects.toThrow(SyntaxError);
  });

  it.each([
    [
      'access token missing',
      { token_type: 'Bearer', expires_in: 300 },
      'usable access token'
    ],
    [
      'token type invalid',
      { access_token: 'ACCESS', token_type: 'Basic', expires_in: 300 },
      'usable access token'
    ],
    [
      'scope narrowed',
      {
        access_token: 'ACCESS',
        token_type: 'Bearer',
        scope: 'profile',
        expires_in: 300
      },
      'did not grant'
    ],
    [
      'zero token lifetime',
      { access_token: 'ACCESS', token_type: 'Bearer', expires_in: 0 },
      'lifetime is unsupported'
    ],
    [
      'unbounded token lifetime',
      { access_token: 'ACCESS', token_type: 'Bearer', expires_in: 999999 },
      'lifetime is unsupported'
    ]
  ])('rejects %s in token exchange', async (_case, payload, expected) => {
    const fetcher = jest.fn(async () =>
      json(payload)
    ) as unknown as typeof fetch;
    await expect(
      redeemCloudCode(
        discovery,
        'code',
        'verifier',
        'vscode://oaslananka.kicadstudiokit/cloud-auth',
        fetcher
      )
    ).rejects.toThrow(expected);
  });

  it('preserves a refresh token when the authorization server does not rotate it', async () => {
    const fetcher = jest.fn(async () =>
      json({
        access_token: 'NEXT',
        token_type: 'Bearer',
        expires_in: 600
      })
    ) as unknown as typeof fetch;
    const next = await refreshCloudToken(discovery, sampleTokens, fetcher);
    expect(next.refreshToken).toBe(sampleTokens.refreshToken);
    expect(next.scope).toBe('projects:read');
  });

  it.each([
    [400, CloudUnauthorizedError],
    [401, CloudUnauthorizedError],
    [503, Error]
  ])(
    'does not treat token endpoint HTTP %s as authenticated',
    async (status, expected) => {
      const fetcher = jest.fn(async () =>
        json({}, status)
      ) as unknown as typeof fetch;
      await expect(
        refreshCloudToken(discovery, sampleTokens, fetcher)
      ).rejects.toBeInstanceOf(expected);
    }
  );

  it('accepts MCP event-stream JSON-RPC and text-only catalog payloads with session reuse', async () => {
    const fetcher = mcpFetcher(
      (method, name) => {
        if (method === 'initialize') {
          return { result: { protocolVersion: CLOUD_PROTOCOL_VERSION } };
        }
        return {
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  name === 'list_devices'
                    ? {
                        devices: [
                          { id: 'device-1', name: 'Laptop', connected: true }
                        ]
                      }
                    : { projects: [{ id: 'project-1', deviceId: 'device-1' }] }
                )
              }
            ]
          }
        };
      },
      { eventStream: true, session: true }
    );
    const inventory = await listCloudInventory(sampleTokens, fetcher, '2.6.3');
    expect(inventory.devices).toEqual([
      {
        id: 'device-1',
        name: 'Laptop',
        connected: true
      }
    ]);
    expect(inventory.projects).toEqual([
      {
        id: 'project-1',
        deviceId: 'device-1',
        alias: 'Project',
        connectorConnected: false,
        available: false
      }
    ]);
    const calls = (fetcher as jest.Mock).mock.calls;
    expect(calls).toHaveLength(3);
    expect(
      JSON.parse(String(calls[0][1]?.body)).params.clientInfo.version
    ).toBe('2.6.3');
    expect(new Headers(calls[1][1]?.headers).get('Mcp-Session-Id')).toBe(
      'session-from-server'
    );
  });

  it.each([
    [
      'JSON-RPC error',
      { error: { code: -32600 } },
      'declined project discovery'
    ],
    ['missing result', {}, 'returned no result'],
    ['malformed result', { result: null }, 'Unexpected Cloud response'],
    ['empty tool content', { result: { content: [] } }, 'unsupported format'],
    [
      'denied tool',
      { result: { isError: true } },
      'denied the requested project catalog'
    ]
  ])('rejects %s from remote catalog', async (_case, payload, expected) => {
    const fetcher = mcpFetcher((method) =>
      method === 'initialize' ? normalMcpResult('initialize', '') : payload
    );
    await expect(listCloudInventory(sampleTokens, fetcher)).rejects.toThrow(
      expected
    );
  });

  it.each([
    ['unexpected device catalog', { devices: null }, 'invalid project catalog'],
    [
      'device without identity',
      { devices: [{ alias: 'No ID' }] },
      'device has no identity'
    ]
  ])('rejects %s before exposing a catalog', async (_case, data, expected) => {
    const fetcher = mcpFetcher((method, name) =>
      method === 'initialize'
        ? normalMcpResult('initialize', '')
        : {
            result: {
              structuredContent:
                name === 'list_devices' ? data : { projects: [] }
            }
          }
    );
    await expect(listCloudInventory(sampleTokens, fetcher)).rejects.toThrow(
      expected
    );
  });

  it('rejects a remote project without an opaque device identity', async () => {
    const fetcher = mcpFetcher((method, name) =>
      method === 'initialize'
        ? normalMcpResult('initialize', '')
        : {
            result: {
              structuredContent:
                name === 'list_devices'
                  ? { devices: [] }
                  : { projects: [{ id: 'project-without-device' }] }
            }
          }
    );
    await expect(listCloudInventory(sampleTokens, fetcher)).rejects.toThrow(
      'project has no identity'
    );
  });

  it.each([401, 403, 503])(
    'reports MCP HTTP %s without exposing project aliases',
    async (status) => {
      const fetcher = mcpFetcher(normalMcpResult, { status });
      const result = listCloudInventory(sampleTokens, fetcher);
      if (status === 401)
        await expect(result).rejects.toBeInstanceOf(CloudUnauthorizedError);
      if (status === 403)
        await expect(result).rejects.toBeInstanceOf(CloudPermissionError);
      if (status === 503) await expect(result).rejects.toThrow('unavailable');
    }
  );
});
