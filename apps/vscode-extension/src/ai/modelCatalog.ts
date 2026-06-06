export type AiProviderId =
  | 'claude'
  | 'openai'
  | 'openrouter'
  | 'copilot'
  | 'gemini'
  | 'local';

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
  /** Whether the model supports image / vision inputs. */
  supportsVision?: boolean;
  /** Whether the model supports the OpenAI `responses` API. */
  supportsResponsesAPI?: boolean;
  /** Whether the model supports MCP tool calling. */
  supportsMcpTools?: boolean;
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
    contextWindow: 200000,
    supportsVision: true,
    supportsMcpTools: true
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
    default: true,
    supportsVision: true,
    supportsMcpTools: true
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'claude',
    label: 'Claude Haiku 4.5 (Fast)',
    maxTokens: 8192,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    contextWindow: 200000,
    supportsVision: true,
    supportsMcpTools: true
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
    apiMode: 'chat-completions',
    supportsVision: true,
    supportsResponsesAPI: true,
    supportsMcpTools: true
  },
  {
    id: 'gpt-5-mini',
    provider: 'openai',
    label: 'GPT-5 Mini (Fast)',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    contextWindow: 1000000,
    apiMode: 'chat-completions',
    supportsVision: true,
    supportsResponsesAPI: true,
    supportsMcpTools: true
  },
  {
    id: 'gpt-5.5',
    provider: 'openai',
    label: 'GPT-5.5 (Responses API)',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    contextWindow: 128000,
    apiMode: 'responses',
    supportsVision: true,
    supportsResponsesAPI: true,
    supportsMcpTools: true
  },
  {
    id: 'gpt-4.5',
    provider: 'openai',
    label: 'GPT-4.5',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    contextWindow: 128000,
    apiMode: 'responses',
    supportsVision: true,
    supportsResponsesAPI: true
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    label: 'GPT-4o',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    contextWindow: 128000,
    apiMode: 'chat-completions',
    supportsVision: true,
    supportsMcpTools: true
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    label: 'GPT-4o mini (Fast)',
    maxTokens: 16384,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    contextWindow: 128000,
    apiMode: 'chat-completions',
    supportsVision: true,
    supportsMcpTools: true
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
    default: true,
    supportsVision: true,
    supportsMcpTools: true
  },
  {
    id: 'gemini-2.0-flash',
    provider: 'gemini',
    label: 'Gemini 2.0 Flash (Fast)',
    maxTokens: 32768,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    contextWindow: 1000000,
    supportsVision: true,
    supportsMcpTools: true
  },
  {
    id: 'gemini-1.5-pro',
    provider: 'gemini',
    label: 'Gemini 1.5 Pro',
    maxTokens: 8192,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    contextWindow: 2000000,
    supportsVision: true,
    supportsMcpTools: true
  }
];

export const OPENROUTER_MODELS: AiModelInfo[] = [
  {
    id: 'openai/gpt-4o',
    provider: 'openrouter',
    label: 'OpenAI GPT-4o through OpenRouter',
    maxTokens: 16384,
    supportsStreaming: true,
    contextWindow: 128000,
    recommended: true,
    default: true,
    supportsVision: true
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
    default: true,
    supportsMcpTools: true
  }
];

export const LOCAL_MODELS: AiModelInfo[] = [];

export const MODEL_CATALOG: Record<AiProviderId, AiModelInfo[]> = {
  claude: CLAUDE_MODELS,
  openai: OPENAI_MODELS,
  openrouter: OPENROUTER_MODELS,
  gemini: GEMINI_MODELS,
  copilot: COPILOT_MODELS,
  local: LOCAL_MODELS
};

export const AI_MODEL_CATALOG = MODEL_CATALOG;

export function getProviderModels(provider: AiProviderId): AiModelInfo[] {
  const models = MODEL_CATALOG[provider];
  if (!models) {
    throw new Error(`Unsupported AI provider: ${String(provider)}`);
  }
  return models;
}

export function getDefaultModel(provider: AiProviderId): string {
  const models = getProviderModels(provider);
  return models.find((model) => model.default)?.id ?? models[0]?.id ?? '';
}

export function getRecommendedModel(
  provider: AiProviderId
): AiModelInfo | undefined {
  return getProviderModels(provider).find((model) => model.recommended);
}
