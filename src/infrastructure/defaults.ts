import type { GameEngineDependencies, LlmGateway, WorldRepository } from './contracts';
import { streamChatText } from '../services/llm';
import { getWorldContext, listWorlds } from '../services/world';
import { isTauriRuntime } from '../services/runtime';
import { tauriLlmGateway } from './tauriLlmGateway';
import { estimateTokens } from '../services/contextBudget';
import { LLMError } from '../services/llm';
import { recordRequestMetric } from '../services/requestMetrics';
import { resolveModelCapability } from '../services/modelCapabilities';
import { resolveWebApiKeyForRequest } from '../services/webApiKeyStore';

export const browserLlmGateway: LlmGateway = {
  streamText: streamChatText,
};

const attempts = new WeakMap<object, number>();

export const runtimeLlmGateway: LlmGateway = {
  async streamText(messages, config, onToken, signal) {
    const startedAt = performance.now();
    const attempt = (attempts.get(config) ?? 0) + 1;
    attempts.set(config, attempt);
    const inputTokensEstimate = messages.reduce(
      (total, message) => total + estimateTokens(message.content),
      0
    );
    const capability = resolveModelCapability(
      config.provider ?? 'deepseek',
      config.model,
      config.contextWindow,
      config.maxTokens
    );
    try {
      if (inputTokensEstimate > capability.contextWindowTokens
        - capability.reservedOutputTokens - 512) {
        throw new LLMError('context_overflow', '请求上下文超过当前模型预算');
      }
      const isTauri = isTauriRuntime();
      const useRustTransport = isTauri
        && (config.provider === 'deepseek'
          || config.provider === 'openai'
          || (import.meta.env.VITE_ENABLE_EXPERIMENTAL_PROVIDERS === 'true'
            && config.provider === 'custom'));
      const requestConfig = !isTauri
        ? {
            ...config,
            apiKey: resolveWebApiKeyForRequest(
              config.provider,
              config.baseUrl,
              config.apiKey
            ),
          }
        : config;
      const output = await (useRustTransport ? tauriLlmGateway : browserLlmGateway)
        .streamText(messages, requestConfig, onToken, signal);
      recordRequestMetric({
        timestamp: new Date().toISOString(),
        provider: config.provider ?? 'unknown',
        model: config.model,
        durationMs: Math.round(performance.now() - startedAt),
        inputTokensEstimate,
        outputTokensEstimate: estimateTokens(output),
        attempt,
        status: 'success',
      });
      attempts.delete(config);
      return output;
    } catch (error) {
      recordRequestMetric({
        timestamp: new Date().toISOString(),
        provider: config.provider ?? 'unknown',
        model: config.model,
        durationMs: Math.round(performance.now() - startedAt),
        inputTokensEstimate,
        outputTokensEstimate: 0,
        attempt,
        status: 'failure',
        errorCode: error instanceof LLMError ? error.code : 'network',
      });
      throw error;
    }
  },
};

export const defaultWorldRepository: WorldRepository = {
  list: listWorlds,
  getContext: getWorldContext,
};

export const defaultGameEngineDependencies: GameEngineDependencies = {
  llm: runtimeLlmGateway,
  worlds: defaultWorldRepository,
};
