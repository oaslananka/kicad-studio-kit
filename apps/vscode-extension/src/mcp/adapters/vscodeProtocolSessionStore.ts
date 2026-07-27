import type { McpProtocolSessionStore } from '../protocol/protocolLifecycle';

const MCP_SESSION_ID_KEY = 'kicadstudio.mcp.sessionId';

export interface MementoSessionState {
  get(key: string): unknown;
  update(key: string, value: unknown): PromiseLike<void>;
}

export class VscodeProtocolSessionStore implements McpProtocolSessionStore {
  constructor(private readonly state: MementoSessionState) {}

  read(): string | undefined {
    const value = this.state.get(MCP_SESSION_ID_KEY);
    return typeof value === 'string' ? value : undefined;
  }

  async write(sessionId: string | undefined): Promise<void> {
    await this.state.update(MCP_SESSION_ID_KEY, sessionId);
  }
}
