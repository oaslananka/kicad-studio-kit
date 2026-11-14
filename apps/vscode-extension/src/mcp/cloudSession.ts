import * as vscode from 'vscode';
import {
  CLOUD_ORIGIN,
  CloudUnauthorizedError,
  callbackUriForScheme,
  createAuthorizationRequest,
  discoverCloudOAuth,
  listCloudInventory,
  redeemCloudCode,
  refreshCloudToken,
  type CloudDevice,
  type CloudOAuthDiscovery,
  type CloudProject,
  type CloudTokens
} from './cloudOAuthContract';

export const CLOUD_SESSION_SLOT = 'kicadstudio.cloud.oauth.session.v1';
export const CLOUD_SELECTION_KEY = 'kicadstudio.cloud.selectedRemoteProjectId';

// The OAuth redirect URI stays exactly as registered with Cloud. The routing
// hint lives in the opaque state and is used only by the local VS Code host.
const WINDOW_STATE = /^([\w-]{32})\.w(\d{1,9})$/u;
const WINDOW_ID = /^\d{1,9}$/u;
const RELAY_MARKER = '_studio_forwarded';

async function stateForWindow(
  callback: string,
  state: string
): Promise<string> {
  const external = await vscode.env.asExternalUri(vscode.Uri.parse(callback));
  const parsed = new URL(external.toString());
  // VS Code URI serialization encodes the query's "=" (e.g. windowId%3D14).
  // Read the Uri.query field, not URL.searchParams on its serialized form.
  const target = new URLSearchParams(external.query ?? parsed.search).get(
    'windowId'
  );
  if (
    !target ||
    !WINDOW_ID.test(target) ||
    parsed.protocol !== new URL(callback).protocol ||
    parsed.host !== new URL(callback).host ||
    parsed.pathname !== new URL(callback).pathname
  ) {
    return state;
  }
  return `${state}.w${target}`;
}

interface PendingAuthorization {
  state: string;
  resolve: (code: string) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Owns the optional Cloud account identity, separate from the active local project.
 * Access/refresh tokens never enter settings, globalState, logs, or webviews.
 */
export class CloudSessionController implements vscode.Disposable {
  private pending: PendingAuthorization | undefined;
  private metadata: CloudOAuthDiscovery | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.window.registerUriHandler({
        handleUri: (uri) => this.handleCallback(uri)
      })
    );
  }

  private handleCallback(uri: vscode.Uri): void {
    const pending = this.pending;
    const expected = callbackUriForScheme(vscode.env.uriScheme);
    const parsed = new URL(expected);
    if (
      uri.scheme !== parsed.protocol.slice(0, -1) ||
      uri.authority !== parsed.host ||
      uri.path !== parsed.pathname
    ) {
      return;
    }
    const params = new URLSearchParams(uri.query);
    const state = params.get('state');
    if (state !== pending?.state) {
      // VS Code may deliver a system URI to a different open window. Route
      // it back at most once; only the origin window holds the PKCE verifier.
      // Never modify the registered redirect_uri sent to Cloud.
      const target = WINDOW_STATE.exec(state ?? '')?.[2];
      if (
        !target ||
        params.has(RELAY_MARKER) ||
        params.has('windowId') ||
        (!params.has('code') && !params.has('error'))
      ) {
        return;
      }
      params.set('windowId', target);
      params.set(RELAY_MARKER, '1');
      // Keep the scheme/authority/path fixed, regardless of callback input.
      void Promise.resolve(
        vscode.env.openExternal(
          vscode.Uri.parse(`${expected}?${params.toString()}`)
        )
      ).catch(() => undefined);
      return;
    }
    if (params.get('iss') && params.get('iss') !== this.metadata?.issuer) {
      pending.reject(
        new Error('Cloud returned an unexpected authorization issuer.')
      );
      return;
    }
    const code = params.get('code');
    if (params.get('error') || !code) {
      pending.reject(new Error('Cloud sign-in was cancelled or denied.'));
      return;
    }
    pending.resolve(code);
  }

  async signIn(): Promise<void> {
    if (this.pending) {
      throw new Error('Cloud sign-in is already in progress.');
    }
    const callback = callbackUriForScheme(vscode.env.uriScheme);
    // Before opening the browser, prove that the *deployed* public client
    // metadata lists this exact callback and the Cloud issuer supports PKCE.
    const metadata = await discoverCloudOAuth(callback);
    this.metadata = metadata;
    const request = createAuthorizationRequest(metadata, callback);
    // asExternalUri supplies the windowId used by VS Code's own URI router.
    // Encode it in OAuth's opaque state, not the strict redirect URI.
    const state = await stateForWindow(callback, request.state);
    const url = new URL(request.url);
    url.searchParams.set('state', state);
    const codePromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Cloud sign-in timed out. Please try again.')),
        180000
      );
      this.pending = { state, resolve, reject, timeout };
    });
    // A browser launch failure must not leave an unobserved authorization
    // promise to reject later when its timer fires.
    void codePromise.catch(() => undefined);
    try {
      const opened = await vscode.env.openExternal(
        vscode.Uri.parse(url.toString())
      );
      if (!opened) {
        throw new Error('VS Code could not open the Cloud sign-in browser.');
      }
      const code = await codePromise;
      const tokens = await redeemCloudCode(
        metadata,
        code,
        request.verifier,
        callback
      );
      await this.saveTokens(tokens);
      // A successful OAuth exchange does NOT mean a project has been granted.
    } finally {
      this.clearPending();
    }
  }

  private clearPending(): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timeout);
    this.pending = undefined;
  }

  private async loadTokens(): Promise<CloudTokens | undefined> {
    const raw = await this.context.secrets.get(CLOUD_SESSION_SLOT);
    if (!raw) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
      const record = parsed as Record<string, unknown>;
      if (
        typeof record['accessToken'] !== 'string' ||
        !record['accessToken'] ||
        typeof record['expiresAt'] !== 'number' ||
        !Number.isFinite(record['expiresAt'])
      ) {
        throw new Error('invalid');
      }
      return parsed as CloudTokens;
    } catch {
      await this.context.secrets.delete(CLOUD_SESSION_SLOT);
      return undefined;
    }
  }

  private async saveTokens(tokens: CloudTokens): Promise<void> {
    await this.context.secrets.store(
      CLOUD_SESSION_SLOT,
      JSON.stringify(tokens)
    );
  }

  private async refresh(tokens: CloudTokens): Promise<CloudTokens> {
    const discovery =
      this.metadata ??
      (await discoverCloudOAuth(callbackUriForScheme(vscode.env.uriScheme)));
    this.metadata = discovery;
    try {
      const refreshed = await refreshCloudToken(discovery, tokens);
      await this.saveTokens(refreshed);
      return refreshed;
    } catch (error) {
      if (error instanceof CloudUnauthorizedError) {
        await this.signOut();
      }
      throw error;
    }
  }

  async isSignedIn(): Promise<boolean> {
    return Boolean(await this.loadTokens());
  }

  async listAuthorizedProjects(): Promise<{
    devices: CloudDevice[];
    projects: CloudProject[];
  }> {
    let tokens = await this.loadTokens();
    if (!tokens) {
      throw new CloudUnauthorizedError();
    }
    if (Date.now() + 60000 >= tokens.expiresAt) {
      tokens = await this.refresh(tokens);
    }
    const reportedVersion = this.context.extension.packageJSON['version'];
    const clientVersion =
      typeof reportedVersion === 'string' ? reportedVersion : '0.0.0';
    try {
      return await listCloudInventory(tokens, fetch, clientVersion);
    } catch (error) {
      if (!(error instanceof CloudUnauthorizedError)) throw error;
      tokens = await this.refresh(tokens);
      try {
        return await listCloudInventory(tokens, fetch, clientVersion);
      } catch (retryError) {
        if (retryError instanceof CloudUnauthorizedError) {
          await this.signOut();
        }
        throw retryError;
      }
    }
  }

  async selectRemoteProject(project: CloudProject): Promise<void> {
    // An opaque remote ID is never a local workspace identity or write grant.
    await this.context.globalState.update(CLOUD_SELECTION_KEY, project.id);
  }

  async signOut(): Promise<void> {
    if (this.pending) {
      this.pending.reject(new Error('Cloud sign-in was cancelled.'));
      clearTimeout(this.pending.timeout);
      this.pending = undefined;
    }
    await this.context.secrets.delete(CLOUD_SESSION_SLOT);
    await this.context.globalState.update(CLOUD_SELECTION_KEY, undefined);
  }

  dispose(): void {
    if (this.pending) {
      this.pending.reject(new Error('Cloud sign-in was cancelled.'));
      clearTimeout(this.pending.timeout);
      this.pending = undefined;
    }
  }
}

export function cloudManageAccessUri(): vscode.Uri {
  return vscode.Uri.parse(`${CLOUD_ORIGIN}/devices`);
}
