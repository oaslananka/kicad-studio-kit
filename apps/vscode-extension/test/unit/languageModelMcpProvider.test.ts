import * as vscode from 'vscode';
import {
  createKicadMcpServerDefinition,
  registerMcpServerDefinitionProvider
} from '../../src/lm/mcpServerDefinitionProvider';
import { createExtensionContextMock, lm, workspace } from './vscodeMock';

describe('language model MCP server definition provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (lm.registerMcpServerDefinitionProvider as jest.Mock).mockImplementation(
      () => ({
        dispose: jest.fn()
      })
    );
  });

  it('creates a stdio MCP server definition for uvx installs', async () => {
    const definition = (await createKicadMcpServerDefinition(
      {
        detectKicadMcpPro: jest.fn()
      } as never,
      {
        found: true,
        command: 'uvx',
        version: '0.8.0',
        source: 'uvx'
      }
    )) as {
      value: { command: string; args: string[]; env: Record<string, string> };
    };

    expect(definition.value.command).toBe('uvx');
    expect(definition.value.args).toEqual(['kicad-mcp-pro']);
    expect(definition.value.env['KICAD_MCP_PROFILE']).toBe('full');
  });

  it('registers the provider when the VS Code API is available', () => {
    const context =
      createExtensionContextMock() as unknown as vscode.ExtensionContext;
    registerMcpServerDefinitionProvider(
      context,
      {
        detectKicadMcpPro: jest.fn().mockResolvedValue({
          found: true,
          command: 'kicad-mcp-pro',
          version: '0.8.1',
          source: 'global'
        })
      } as never,
      {
        debug: jest.fn()
      } as never
    );

    expect(lm.registerMcpServerDefinitionProvider).toHaveBeenCalledWith(
      'kicadstudio.mcpServer',
      expect.objectContaining({
        provideMcpServerDefinitions: expect.any(Function),
        resolveMcpServerDefinition: expect.any(Function)
      })
    );
  });

  it('resolves provider callbacks into a concrete stdio definition', async () => {
    const context =
      createExtensionContextMock() as unknown as vscode.ExtensionContext;
    registerMcpServerDefinitionProvider(
      context,
      {
        detectKicadMcpPro: jest.fn().mockResolvedValue({
          found: true,
          command: 'kicad-mcp-pro',
          version: '0.8.1',
          source: 'global'
        })
      } as never,
      {
        debug: jest.fn()
      } as never
    );

    const provider = (lm.registerMcpServerDefinitionProvider as jest.Mock).mock
      .calls[0]?.[1] as {
      provideMcpServerDefinitions(): Promise<
        Array<{ value: { command: string } }>
      >;
      resolveMcpServerDefinition(server: {
        value: { command: string };
      }): Promise<{ value: { command: string } }>;
    };
    const [definition] = await provider.provideMcpServerDefinitions();

    expect(definition?.value.command).toBe('kicad-mcp-pro');
    await expect(
      provider.resolveMcpServerDefinition(definition as never)
    ).resolves.toBe(definition);
  });

  it('returns undefined when the install is missing or no workspace is open', async () => {
    await expect(
      createKicadMcpServerDefinition({
        detectKicadMcpPro: jest.fn().mockResolvedValue({
          found: false,
          source: 'none'
        })
      } as never)
    ).resolves.toBeUndefined();

    const originalFolders = workspace.workspaceFolders;
    workspace.workspaceFolders = [];
    await expect(
      createKicadMcpServerDefinition({
        detectKicadMcpPro: jest.fn().mockResolvedValue({
          found: true,
          command: 'kicad-mcp-pro',
          source: 'global'
        })
      } as never)
    ).resolves.toBeUndefined();
    workspace.workspaceFolders = originalFolders;
  });

  it('logs and skips registration when the VS Code API is unavailable', () => {
    const originalRegister = lm.registerMcpServerDefinitionProvider;
    const logger = { debug: jest.fn() };
    (
      lm as { registerMcpServerDefinitionProvider?: unknown }
    ).registerMcpServerDefinitionProvider = undefined;

    registerMcpServerDefinitionProvider(
      createExtensionContextMock() as unknown as vscode.ExtensionContext,
      {
        detectKicadMcpPro: jest.fn()
      } as never,
      logger as never
    );

    expect(logger.debug).toHaveBeenCalledWith(
      'VS Code MCP server definition provider API is unavailable on this host.'
    );
    (
      lm as { registerMcpServerDefinitionProvider?: unknown }
    ).registerMcpServerDefinitionProvider = originalRegister;
  });
});
