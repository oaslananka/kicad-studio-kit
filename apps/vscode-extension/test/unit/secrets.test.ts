import * as os from 'node:os';
import * as path from 'node:path';
import { AI_SECRET_KEY_LEGACY } from '../../src/constants';
import {
  getAiSecretKey,
  migratePlaintextSettingToSecret,
  migrateLegacyAiSecret,
  redactApiKey,
  redactSensitiveText
} from '../../src/utils/secrets';

describe('AI secret utilities', () => {
  it('redacts explicit and provider-shaped API keys', () => {
    expect(
      redactApiKey('failed with sk-test1234567890', 'sk-test1234567890')
    ).toContain('sk-t...7890');
    expect(redactApiKey('bad key AIzaSyExampleSecret123456')).toContain(
      'AIza...3456'
    );
    expect(redactApiKey('failed with tiny', 'tiny')).toContain('***');
    expect(
      redactSensitiveText('credential nvapi-' + 'a'.repeat(24))
    ).not.toContain('nvapi-' + 'a'.repeat(24));
  });

  it('redacts bearer tokens, assignments, known secret values, and home paths', () => {
    const redacted = redactSensitiveText(
      `Bearer abc.def api_token=secret-value known-secret-value ${process.env['USERPROFILE'] ?? ''}`,
      ['known-secret-value']
    );

    expect(redacted).toContain('Bearer ***');
    expect(redacted).toContain('api_token=***');
    expect(redacted).not.toContain('secret-value');
    expect(redacted).not.toContain('known-secret-value');
  });

  it('redacts home paths without corrupting root paths', () => {
    const home = os.homedir();
    const redacted = redactSensitiveText(`path=${home}`);

    if (home && path.resolve(home) !== path.parse(path.resolve(home)).root) {
      expect(redacted).toContain('path=~');
      expect(redacted).not.toContain(home);
    }
  });

  it('migrates the legacy shared key to the selected provider key', async () => {
    const store = new Map<string, string>([
      [AI_SECRET_KEY_LEGACY, 'legacy-secret']
    ]);
    const secrets = {
      get: jest.fn(async (key: string) => store.get(key)),
      store: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      delete: jest.fn(async (key: string) => {
        store.delete(key);
      })
    };

    await expect(
      migrateLegacyAiSecret({ secrets, provider: 'gemini' })
    ).resolves.toBe('legacy-secret');

    expect(store.get(getAiSecretKey('gemini'))).toBe('legacy-secret');
    expect(store.has(AI_SECRET_KEY_LEGACY)).toBe(false);
  });

  it('moves deprecated plaintext settings into SecretStorage and clears targets', async () => {
    const secretStore = new Map<string, string>();
    const config = {
      get: jest.fn(() => 'plaintext-key'),
      update: jest.fn(async () => undefined)
    };
    const secrets = {
      get: jest.fn(async (key: string) => secretStore.get(key)),
      store: jest.fn(async (key: string, value: string) => {
        secretStore.set(key, value);
      })
    };

    await expect(
      migratePlaintextSettingToSecret({
        config,
        secrets,
        settingKey: 'kicadstudio.ai.apiKey',
        secretKey: getAiSecretKey('openrouter'),
        clearTargets: ['global', 'workspace', 'workspaceFolder']
      })
    ).resolves.toBe(true);

    expect(secretStore.get(getAiSecretKey('openrouter'))).toBe('plaintext-key');
    expect(config.update.mock.calls).toEqual([
      ['kicadstudio.ai.apiKey', undefined, 'global'],
      ['kicadstudio.ai.apiKey', undefined, 'workspace'],
      ['kicadstudio.ai.apiKey', undefined, 'workspaceFolder']
    ]);
  });
});
