export type AiProviderId = 'claude' | 'openai' | 'copilot' | 'gemini' | 'codex';

export interface ModelInfo {
  id: string;
  label: string;
  maxTokens: number;
  supportsStreaming: boolean;
  contextWindow: number;
  recommended?: boolean;
  default?: boolean;
  provider?: AiProviderId;
  apiMode?: 'responses' | 'chat-completions';
  maxOutputTokens?: number;
}

export type AiModelInfo = ModelInfo & { provider: AiProviderId };

export const CLAUDE_MODELS: AiModelInfo[] = [
  {
    id: 'claude-opus-4-5',
    provider: 'claude',
    label: 'Claude Opus 4.5 (Most capable)',
    maxTokens: 32000,
    maxOutputTokens: 32000,
    supportsStreaming: true,
    contextWindow: 200000
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'claude',
    label: 'Claude Sonnet 4.6 (Recommended)',
    maxTokens: 16000,
    maxOutputTokens: 16000,
    supportsStreaming: true,
    contextWindow: 200000,
    recommended: true,
    default: true
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'claude',
    label: 'Claude Haiku 4.5 (Fast)',
    maxTokens: 8192,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    contextWindow: 200000
  }
];

export const OPENAI_MODELS: AiModelInfo[] = [
  {
    id: 'gpt-5',
    provider: 'openai',
    label: 'GPT-5 (Most capable)',
    maxTokens: 32768,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    contextWindow: 1000000,
    recommended: true,
    default: true,
    apiMode: 'chat-completions'
  },
  {
    id: 'gpt-5-mini',
    provider: 'openai',
    label: 'GPT-5 Mini (Fast)',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    contextWindow: 1000000,
    apiMode: 'chat-completions'
  },
  {
    id: 'gpt-5.5',
    provider: 'openai',
    label: 'GPT-5.5 (Responses API)',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    contextWindow: 128000,
    apiMode: 'responses'
  },
  {
    id: 'gpt-4.5',
    provider: 'openai',
    label: 'GPT-4.5',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    contextWindow: 128000,
    apiMode: 'responses'
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    label: 'GPT-4o',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    contextWindow: 128000,
    apiMode: 'chat-completions'
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    label: 'GPT-4o mini (Fast)',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    contextWindow: 128000,
    apiMode: 'chat-completions'
  },
  {
    id: 'o1',
    provider: 'openai',
    label: 'o1 (Reasoning)',
    maxTokens: 32768,
    maxOutputTokens: 32768,
    supportsStreaming: false,
    contextWindow: 200000,
    apiMode: 'responses'
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    label: 'o3-mini (Fast reasoning)',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: false,
    contextWindow: 200000,
    apiMode: 'responses'
  }
];

export const GEMINI_MODELS: AiModelInfo[] = [
  {
    id: 'gemini-2.5-pro',
    provider: 'gemini',
    label: 'Gemini 2.5 Pro (Recommended)',
    maxTokens: 65536,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    contextWindow: 1000000,
    recommended: true,
    default: true
  },
  {
    id: 'gemini-2.0-flash',
    provider: 'gemini',
    label: 'Gemini 2.0 Flash (Fast)',
    maxTokens: 32768,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    contextWindow: 1000000
  },
  {
    id: 'gemini-1.5-pro',
    provider: 'gemini',
    label: 'Gemini 1.5 Pro',
    maxTokens: 8192,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    contextWindow: 2000000
  }
];

export const COPILOT_MODELS: AiModelInfo[] = [
  {
    id: 'copilot/default',
    provider: 'copilot',
    label: 'Best available GitHub Copilot model',
    maxTokens: 4096,
    supportsStreaming: true,
    contextWindow: 128000,
    recommended: true,
    default: true
  }
];

export const CODEX_MODELS: AiModelInfo[] = [
  {
    id: 'codex/default',
    provider: 'codex',
    label: 'VS Code Codex (Best available)',
    maxTokens: 4096,
    supportsStreaming: true,
    contextWindow: 128000,
    recommended: true,
    default: true
  }
];

export const MODEL_CATALOG: Record<AiProviderId, AiModelInfo[]> = {
  claude: CLAUDE_MODELS,
  openai: OPENAI_MODELS,
  gemini: GEMINI_MODELS,
  copilot: COPILOT_MODELS,
  codex: CODEX_MODELS
};

export const AI_MODEL_CATALOG = MODEL_CATALOG;

export function getProviderModels(provider: AiProviderId): AiModelInfo[] {
  return MODEL_CATALOG[provider];
}

export function getDefaultModel(provider: AiProviderId): string {
  return (
    MODEL_CATALOG[provider].find((model) => model.default)?.id ??
    MODEL_CATALOG[provider][0]?.id ??
    ''
  );
}

export function getRecommendedModel(
  provider: AiProviderId
): AiModelInfo | undefined {
  return MODEL_CATALOG[provider].find((model) => model.recommended);
}
