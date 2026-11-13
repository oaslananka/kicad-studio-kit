import { createHash, randomBytes } from 'node:crypto';

export const CLOUD_ORIGIN = 'https://kicad-mcp-pro.oaslananka.dev';
export const CLOUD_RESOURCE = `${CLOUD_ORIGIN}/mcp`;
export const CLOUD_CLIENT_ID =
  'https://oaslananka.github.io/kicad-studio-kit/cloud-oauth-client.json';
export const CLOUD_SCOPE = 'openid profile offline_access projects:read';
export const CLOUD_PROTOCOL_VERSION = '2026-07-28';

export interface CloudOAuthDiscovery {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  issuer: string;
}

export interface CloudTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
}

export interface CloudDevice {
  id: string;
  name: string;
  connected: boolean;
}

export interface CloudProject {
  id: string;
  alias: string;
  deviceId: string;
  connectorConnected: boolean;
  available: boolean;
  reason?: string;
}

type Fetcher = typeof fetch;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unexpected Cloud response.');
  }
  return value as Record<string, unknown>;
}

function nonempty(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : '';
}

function requireExactHttpEndpoint(value: unknown, expected: string): string {
  if (value !== expected) {
    throw new Error(
      'Cloud OAuth discovery is incompatible with this Studio version.'
    );
  }
  return expected;
}

async function readResponse(
  response: Response,
  maxLength = 262144
): Promise<unknown> {
  const length = Number(response.headers.get('content-length') ?? '0');
  if (length > maxLength) {
    throw new Error('Cloud response exceeds the supported size.');
  }
  const body = await response.text();
  if (body.length > maxLength) {
    throw new Error('Cloud response exceeds the supported size.');
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const events = body.split(/\r?\n\r?\n/u);
    const message = events
      .flatMap((event) =>
        event
          .split(/\r?\n/u)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
      )
      .reverse()
      .find((value) => value.startsWith('{'));
    if (!message) {
      throw new Error('Cloud MCP returned no JSON-RPC result.');
    }
    return JSON.parse(message) as unknown;
  }
  return JSON.parse(body) as unknown;
}

async function getJson(fetchFn: Fetcher, url: string): Promise<unknown> {
  const response = await fetchFn(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error('Cloud sign-in metadata is unavailable. Try again later.');
  }
  return readResponse(response, 16384);
}

export function callbackUriForScheme(scheme: string): string {
  if (scheme !== 'vscode' && scheme !== 'vscode-insiders') {
    throw new Error('Cloud sign-in requires the VS Code desktop URI handler.');
  }
  return `${scheme}://oaslananka.kicadstudiokit/cloud-auth`;
}

/** Validate *deployed* OAuth metadata, rather than assuming source-tree capabilities. */
export async function discoverCloudOAuth(
  callback: string,
  fetchFn: Fetcher = fetch
): Promise<CloudOAuthDiscovery> {
  const protectedResource = record(
    await getJson(
      fetchFn,
      `${CLOUD_ORIGIN}/.well-known/oauth-protected-resource`
    )
  );
  requireExactHttpEndpoint(protectedResource['resource'], CLOUD_RESOURCE);
  if (
    !Array.isArray(protectedResource['authorization_servers']) ||
    !protectedResource['authorization_servers'].includes(
      `${CLOUD_ORIGIN}/api/auth`
    )
  ) {
    throw new Error('Cloud OAuth resource discovery did not match its issuer.');
  }
  const metadata = record(
    await getJson(
      fetchFn,
      `${CLOUD_ORIGIN}/.well-known/oauth-authorization-server/api/auth`
    )
  );
  const issuer = requireExactHttpEndpoint(
    metadata['issuer'],
    `${CLOUD_ORIGIN}/api/auth`
  );
  const authorizationEndpoint = requireExactHttpEndpoint(
    metadata['authorization_endpoint'],
    `${CLOUD_ORIGIN}/api/auth/oauth2/authorize`
  );
  const tokenEndpoint = requireExactHttpEndpoint(
    metadata['token_endpoint'],
    `${CLOUD_ORIGIN}/api/auth/oauth2/token`
  );
  if (
    metadata['client_id_metadata_document_supported'] !== true ||
    !Array.isArray(metadata['code_challenge_methods_supported']) ||
    !metadata['code_challenge_methods_supported'].includes('S256') ||
    !Array.isArray(metadata['scopes_supported']) ||
    !metadata['scopes_supported'].includes('projects:read')
  ) {
    throw new Error('This Cloud server does not support Studio OAuth PKCE.');
  }
  const clientDocument = record(await getJson(fetchFn, CLOUD_CLIENT_ID));
  if (
    clientDocument['client_id'] !== CLOUD_CLIENT_ID ||
    clientDocument['token_endpoint_auth_method'] !== 'none' ||
    !Array.isArray(clientDocument['redirect_uris']) ||
    !clientDocument['redirect_uris'].includes(callback)
  ) {
    throw new Error(
      'Studio OAuth client registration has not been published yet.'
    );
  }
  return { authorizationEndpoint, tokenEndpoint, issuer };
}

export function createAuthorizationRequest(
  metadata: CloudOAuthDiscovery,
  redirectUri: string
): { url: string; state: string; verifier: string } {
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL(metadata.authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLOUD_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: CLOUD_SCOPE,
    resource: CLOUD_RESOURCE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state
  }).toString();
  return { url: url.toString(), state, verifier };
}

function parseTokenPayload(
  payload: unknown,
  previous?: CloudTokens
): CloudTokens {
  const value = record(payload);
  const accessToken = nonempty(value['access_token']);
  if (
    !accessToken ||
    value['token_type']?.toString().toLowerCase() !== 'bearer'
  ) {
    throw new Error('Cloud did not issue a usable access token.');
  }
  const scope = nonempty(value['scope']) || previous?.scope || '';
  if (scope && !scope.split(' ').includes('projects:read')) {
    throw new Error('The Cloud account did not grant projects:read.');
  }
  const expiresIn = Number(value['expires_in']);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 86400) {
    throw new Error('Cloud token lifetime is unsupported.');
  }
  return {
    accessToken,
    ...(nonempty(value['refresh_token'])
      ? { refreshToken: String(value['refresh_token']) }
      : previous?.refreshToken
        ? { refreshToken: previous.refreshToken }
        : {}),
    expiresAt: Date.now() + Math.floor(expiresIn * 1000),
    scope
  };
}

export class CloudUnauthorizedError extends Error {
  constructor() {
    super('Cloud session expired or was revoked. Sign in again.');
    this.name = 'CloudUnauthorizedError';
  }
}

export class CloudPermissionError extends Error {
  constructor() {
    super(
      'Cloud access was denied for this client or project. Review permissions in Cloud.'
    );
    this.name = 'CloudPermissionError';
  }
}

async function exchangeToken(
  fetchFn: Fetcher,
  endpoint: string,
  params: URLSearchParams,
  previous?: CloudTokens
): Promise<CloudTokens> {
  const response = await fetchFn(endpoint, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: params.toString()
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new CloudUnauthorizedError();
    }
    throw new Error('Cloud could not finish authentication.');
  }
  return parseTokenPayload(await readResponse(response, 16384), previous);
}

export async function redeemCloudCode(
  discovery: CloudOAuthDiscovery,
  code: string,
  verifier: string,
  redirectUri: string,
  fetchFn: Fetcher = fetch
): Promise<CloudTokens> {
  return exchangeToken(
    fetchFn,
    discovery.tokenEndpoint,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLOUD_CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: CLOUD_RESOURCE
    })
  );
}

export async function refreshCloudToken(
  discovery: CloudOAuthDiscovery,
  tokens: CloudTokens,
  fetchFn: Fetcher = fetch
): Promise<CloudTokens> {
  if (!tokens.refreshToken) {
    throw new CloudUnauthorizedError();
  }
  const fields = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLOUD_CLIENT_ID,
    resource: CLOUD_RESOURCE
  });
  // Set the live token at request time. No credential value is embedded in code.
  fields.set('refresh_token', tokens.refreshToken);
  return exchangeToken(fetchFn, discovery.tokenEndpoint, fields, tokens);
}

interface McpCallResult {
  data: unknown;
  sessionId?: string;
}

async function mcpRequest(
  fetchFn: Fetcher,
  tokens: CloudTokens,
  id: number,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string
): Promise<McpCallResult> {
  const response = await fetchFn(CLOUD_RESOURCE, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': CLOUD_PROTOCOL_VERSION,
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params })
  });
  if (response.status === 401) {
    throw new CloudUnauthorizedError();
  }
  if (response.status === 403) {
    throw new CloudPermissionError();
  }
  if (!response.ok) {
    throw new Error('Cloud project discovery is unavailable.');
  }
  const result = record(await readResponse(response));
  if (result['error']) {
    throw new Error('Cloud MCP declined project discovery.');
  }
  if (!('result' in result)) {
    throw new Error('Cloud MCP returned no result.');
  }
  const nextSessionId = response.headers.get('mcp-session-id');
  return {
    data: result['result'],
    ...(nextSessionId ? { sessionId: nextSessionId } : {})
  };
}

async function invokeReadOnlyTool(
  fetchFn: Fetcher,
  tokens: CloudTokens,
  name: 'list_devices' | 'list_projects',
  sessionId?: string
): Promise<Record<string, unknown>> {
  const result = record(
    (
      await mcpRequest(
        fetchFn,
        tokens,
        name === 'list_devices' ? 2 : 3,
        'tools/call',
        {
          name,
          arguments: {}
        },
        sessionId
      )
    ).data
  );
  if (result['isError'] === true) {
    throw new Error('Cloud denied the requested project catalog.');
  }
  const structured = result['structuredContent'];
  if (structured) {
    return record(structured);
  }
  const items = result['content'];
  if (Array.isArray(items)) {
    const first = items.find(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        (item as Record<string, unknown>)['type'] === 'text'
    ) as Record<string, unknown> | undefined;
    if (first && typeof first['text'] === 'string') {
      return record(JSON.parse(first['text']) as unknown);
    }
  }
  throw new Error('Cloud project response has an unsupported format.');
}

/** Read only OAuth-granted aliases; never download or mutate native KiCad files. */
export async function listCloudInventory(
  tokens: CloudTokens,
  fetchFn: Fetcher = fetch,
  clientVersion = '0.0.0'
): Promise<{ devices: CloudDevice[]; projects: CloudProject[] }> {
  const init = await mcpRequest(fetchFn, tokens, 1, 'initialize', {
    protocolVersion: CLOUD_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'kicad-studio', version: clientVersion }
  });
  const server = record(init.data);
  if (server['protocolVersion'] !== CLOUD_PROTOCOL_VERSION) {
    throw new Error('This Cloud MCP protocol version is not supported.');
  }
  const devicesData = await invokeReadOnlyTool(
    fetchFn,
    tokens,
    'list_devices',
    init.sessionId
  );
  const projectsData = await invokeReadOnlyTool(
    fetchFn,
    tokens,
    'list_projects',
    init.sessionId
  );
  const deviceItems = devicesData['devices'];
  const projectItems = projectsData['projects'];
  if (!Array.isArray(deviceItems) || !Array.isArray(projectItems)) {
    throw new Error('Cloud returned an invalid project catalog.');
  }
  const devices = deviceItems.map((item): CloudDevice => {
    const d = record(item);
    if (!nonempty(d['id'])) throw new Error('Cloud device has no identity.');
    return {
      id: nonempty(d['id']),
      name: nonempty(d['alias']) || nonempty(d['name']) || 'Device',
      connected: d['connected'] === true
    };
  });
  const projects = projectItems.map((item): CloudProject => {
    const p = record(item);
    if (!nonempty(p['id']) || !nonempty(p['deviceId'])) {
      throw new Error('Cloud project has no identity.');
    }
    return {
      id: nonempty(p['id']),
      deviceId: nonempty(p['deviceId']),
      alias: nonempty(p['alias']) || 'Project',
      connectorConnected: p['connectorConnected'] === true,
      available: p['available'] === true,
      ...(nonempty(p['reason']) ? { reason: nonempty(p['reason']) } : {})
    };
  });
  return { devices, projects };
}
