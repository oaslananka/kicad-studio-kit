import { COMMANDS, OCTOPART_SECRET_KEY, SETTINGS } from '../../src/constants';
import { registerSecretCommands } from '../../src/commands/secretCommands';
import {
  commands,
  createExtensionContextMock,
  window,
  __setConfiguration
} from './vscodeMock';
import * as secretsUtils from '../../src/utils/secrets';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('registerSecretCommands', () => {
  let services: any;
  let ctx: ReturnType<typeof createExtensionContextMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({});
    ctx = createExtensionContextMock();
    services = {
      context: ctx,
      aiProviders: {
        setApiKey: jest.fn(),
        clearApiKey: jest.fn(),
        clearAllApiKeys: jest.fn(),
        getApiKey: jest.fn()
      }
    };
    registerSecretCommands(services);
  });

  function handler(commandId: string): (...args: unknown[]) => unknown {
    const entry = (commands.registerCommand as jest.Mock).mock.calls.find(
      ([id]: [string]) => id === commandId
    );
    if (!entry) throw new Error(`Command not registered: ${commandId}`);
    return entry[1];
  }

  describe('setOctopartApiKey', () => {
    it('stores the key when the user provides one', async () => {
      (window.showInputBox as jest.Mock).mockResolvedValue('octo-key-123');

      await handler(COMMANDS.setOctopartApiKey)();

      expect(ctx.secrets.store).toHaveBeenCalledWith(
        OCTOPART_SECRET_KEY,
        'octo-key-123'
      );
      expect(window.showInformationMessage).toHaveBeenCalled();
    });

    it('does nothing when the user cancels', async () => {
      (window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      await handler(COMMANDS.setOctopartApiKey)();

      expect(ctx.secrets.store).not.toHaveBeenCalled();
    });
  });

  describe('setAiApiKey', () => {
    it('stores the key after picking a provider', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'OpenAI',
        provider: 'openai'
      });
      (window.showInputBox as jest.Mock).mockResolvedValue('sk-test-123');

      await handler(COMMANDS.setAiApiKey)();

      expect(services.aiProviders.setApiKey).toHaveBeenCalledWith(
        'openai',
        'sk-test-123'
      );
    });

    it('uses the configured provider without prompting when already set', async () => {
      __setConfiguration({ [SETTINGS.aiProvider]: 'gemini' });
      (window.showInputBox as jest.Mock).mockResolvedValue('AIza-test');

      await handler(COMMANDS.setAiApiKey)();

      expect(services.aiProviders.setApiKey).toHaveBeenCalledWith(
        'gemini',
        'AIza-test'
      );
    });

    it('does nothing when provider picker is cancelled', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await handler(COMMANDS.setAiApiKey)();

      expect(services.aiProviders.setApiKey).not.toHaveBeenCalled();
    });
  });

  describe('clearAiKey', () => {
    it('clears the key for the selected provider', async () => {
      (window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'Claude',
        provider: 'claude'
      });

      await handler(COMMANDS.clearAiKey)();

      expect(services.aiProviders.clearApiKey).toHaveBeenCalledWith('claude');
    });
  });

  describe('clearSecrets', () => {
    it('clears all AI and Octopart secrets', async () => {
      await handler(COMMANDS.clearSecrets)();

      expect(services.aiProviders.clearAllApiKeys).toHaveBeenCalled();
      expect(ctx.secrets.delete).toHaveBeenCalledWith(OCTOPART_SECRET_KEY);
    });
  });

  describe('showStoredSecrets', () => {
    it('shows a message listing stored secrets', async () => {
      jest
        .spyOn(secretsUtils, 'getAiSecretProviders')
        .mockReturnValue(['openai', 'claude']);
      (services.aiProviders.getApiKey as jest.Mock)
        .mockResolvedValueOnce('sk-abcdef123456')
        .mockResolvedValueOnce(undefined);
      (ctx.secrets.get as jest.Mock).mockResolvedValue('octo-456');

      await handler(COMMANDS.showStoredSecrets)();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('OpenAI')
      );
    });

    it('shows a "no secrets" message when nothing is stored', async () => {
      jest
        .spyOn(secretsUtils, 'getAiSecretProviders')
        .mockReturnValue(['openai', 'claude']);
      (services.aiProviders.getApiKey as jest.Mock).mockResolvedValue(
        undefined
      );
      (ctx.secrets.get as jest.Mock).mockResolvedValue(undefined);

      await handler(COMMANDS.showStoredSecrets)();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('No KiCad Studio secrets')
      );
    });
  });
});
