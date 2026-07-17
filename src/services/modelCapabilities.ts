import type { LlmProvider } from '../types/settings';

export interface ModelCapability {
  provider: LlmProvider;
  model: string;
  contextWindowTokens: number;
  reservedOutputTokens: number;
  supportsStreaming: true;
}

const PROVIDER_CONTEXT_DEFAULTS: Record<LlmProvider, number> = {
  deepseek: 65536,
  openai: 128000,
  ollama: 32768,
  llamacpp: 32768,
  llamacpp_local: 32768,
  custom: 32768,
};

/**
 * Capabilities are conservative planning values, not billing claims. A saved
 * context-window override remains authoritative for custom deployments.
 */
export function resolveModelCapability(
  provider: LlmProvider,
  model: string,
  configuredContextWindow?: number,
  configuredMaxOutput = 4096
): ModelCapability {
  const contextWindowTokens = configuredContextWindow != null
    && Number.isFinite(configuredContextWindow)
    && configuredContextWindow >= 4096
    ? Math.floor(configuredContextWindow)
    : PROVIDER_CONTEXT_DEFAULTS[provider];
  const reservedOutputTokens = Math.max(
    1,
    Math.min(Math.floor(configuredMaxOutput), contextWindowTokens - 2048)
  );
  return {
    provider,
    model,
    contextWindowTokens,
    reservedOutputTokens,
    supportsStreaming: true,
  };
}
