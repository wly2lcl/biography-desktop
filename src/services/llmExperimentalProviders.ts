import type { LlmProvider } from '../types/settings';
import {
  createOpenAICompatibleAdapter,
  type LlmProviderAdapter,
} from './llm';

type ExperimentalProvider = Exclude<LlmProvider, 'deepseek' | 'openai'>;

export const EXPERIMENTAL_ADAPTER_BUNDLE_MARKER = 'BIOGRAPHY_EXPERIMENTAL_ADAPTER_MODULE';

export const EXPERIMENTAL_LLM_PROVIDER_ADAPTERS: Readonly<
  Record<ExperimentalProvider, LlmProviderAdapter>
> = {
  ollama: createOpenAICompatibleAdapter('ollama'),
  llamacpp: createOpenAICompatibleAdapter('llamacpp'),
  llamacpp_local: createOpenAICompatibleAdapter('llamacpp_local'),
  custom: createOpenAICompatibleAdapter('custom'),
};
