import * as os from 'node:os';
import { McpLogger } from '../../src/mcp/mcpLogger';
import { __setConfiguration } from './vscodeMock';

describe('McpLogger', () => {
  beforeEach(() => {
    __setConfiguration({ 'kicadstudio.mcp.logSize': 2 });
  });

  it('evicts old entries and renders markdown', () => {
    const logger = new McpLogger();
    logger.recordRequest('a', '{}', {});
    logger.recordResponse('b', { ok: true });
    logger.recordError('c', 'boom');

    expect(logger.list()).toHaveLength(2);
    expect(logger.renderMarkdown()).toContain('ERROR c');
  });

  it('redacts authorization headers and user home paths', () => {
    const logger = new McpLogger();
    logger.recordRequest('tools/call', JSON.stringify({ path: os.homedir() }), {
      Authorization: 'Bearer secret',
      'MCP-Session-Id': 'session-secret'
    });

    const rendered = logger.renderMarkdown();
    expect(rendered).toContain('[redacted]');
    expect(rendered).toContain('~');
    expect(rendered).not.toContain('Bearer secret');
    expect(rendered).not.toContain('session-secret');
  });

  it('redacts tokens, API keys, cookies, and secret-looking values in bodies', () => {
    const logger = new McpLogger();
    logger.recordResponse('tools/call', {
      headers: {
        Cookie: 'sid=secret-cookie',
        'X-Api-Key': 'secret-api-key'
      },
      body: {
        token: 'secret-token',
        apiKey: 'secret-api-key',
        Authorization: 'Bearer nested-secret'
      },
      url: 'http://localhost:27185/mcp?access_token=query-secret'
    });

    const rendered = logger.renderMarkdown();
    expect(rendered).toContain('[redacted]');
    expect(rendered).not.toContain('secret-cookie');
    expect(rendered).not.toContain('secret-token');
    expect(rendered).not.toContain('secret-api-key');
    expect(rendered).not.toContain('nested-secret');
    expect(rendered).not.toContain('query-secret');
  });

  it('truncates large payloads and clears entries', () => {
    const logger = new McpLogger();
    logger.recordResponse('large', { body: 'x'.repeat(9000) });
    expect(logger.renderMarkdown()).toContain('[truncated]');
    logger.clear();
    expect(logger.renderMarkdown()).toContain('No MCP traffic');
  });
});
