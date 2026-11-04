import { OpenAIProvider } from './openaiProvider';

const NVIDIA_BUILD_CHAT_COMPLETIONS_URL =
  'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * NVIDIA Build API Catalog cloud inference (not a self-hosted NIM).
 * Model IDs are passed through unchanged, including newly added catalog IDs.
 */
export class NvidiaBuildProvider extends OpenAIProvider {
  constructor(apiKey: string, model: string) {
    super(apiKey, model, 'chat-completions', {
      chatCompletionsUrl: NVIDIA_BUILD_CHAT_COMPLETIONS_URL,
      chatCompletionsTokenField: 'max_tokens',
      name: 'NVIDIA Build'
    });
  }
}
