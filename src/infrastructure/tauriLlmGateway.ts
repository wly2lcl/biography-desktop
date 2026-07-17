import type { LlmGateway } from './contracts';
import { LLMError, type LLMErrorCode } from '../services/llm';
import type { LlmProvider } from '../types/settings';
import { generateId } from '../utils/format';

type RustTransportProvider = Extract<LlmProvider, 'deepseek' | 'openai' | 'custom'>;

type TauriLlmEvent =
  | { type: 'token'; requestId: string; content: string }
  | { type: 'completed'; requestId: string }
  | {
    type: 'error';
    requestId: string;
    code: string;
    message: string;
    status?: number;
    retryAfterMs?: number;
  };

const ERROR_CODES = new Set<LLMErrorCode>([
  'invalid_config',
  'authentication',
  'rate_limit',
  'timeout',
  'network',
  'server',
  'invalid_response',
  'cancelled',
  'context_overflow',
]);

function transportProvider(provider: LlmProvider | undefined): RustTransportProvider {
  if (provider === 'deepseek' || provider === 'openai') return provider;
  if (provider === 'custom'
    && import.meta.env.VITE_ENABLE_EXPERIMENTAL_PROVIDERS === 'true') return provider;
  throw new LLMError('invalid_config', `稳定桌面版不支持提供商：${provider ?? '未指定'}`);
}

export const tauriLlmGateway: LlmGateway = {
  async streamText(messages, config, onToken, signal) {
    if (signal?.aborted) {
      throw new LLMError('cancelled', '请求已取消');
    }
    const { Channel, invoke } = await import('@tauri-apps/api/core');
    if (signal?.aborted) {
      throw new LLMError('cancelled', '请求已取消');
    }
    const requestId = generateId();
    let fullText = '';
    let settled = false;

    return new Promise<string>((resolve, reject) => {
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        callback();
      };
      const onAbort = () => {
        void invoke('cancel_llm_request', { requestId }).catch(() => undefined);
        finish(() => reject(new LLMError('cancelled', '请求已取消')));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const channel = new Channel<TauriLlmEvent>((event) => {
        if (event.requestId !== requestId || settled) return;
        if (event.type === 'token') {
          fullText += event.content;
          onToken?.(event.content);
          return;
        }
        if (event.type === 'completed') {
          finish(() => resolve(fullText));
          return;
        }
        const code = ERROR_CODES.has(event.code as LLMErrorCode)
          ? event.code as LLMErrorCode
          : 'invalid_response';
        finish(() => reject(new LLMError(
          code,
          event.message,
          event.status,
          event.retryAfterMs
        )));
      });

      void invoke('stream_llm', {
        request: {
          requestId,
          provider: transportProvider(config.provider),
          baseUrl: config.baseUrl,
          model: config.model,
          messages,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          timeout: config.timeout,
          // Only draft connection tests contain this value. Normal narrative
          // requests leave it empty and Rust resolves the key from Keyring.
          ephemeralApiKey: config.apiKey.trim() || undefined,
        },
        onEvent: channel,
      }).catch((error: unknown) => {
        finish(() => reject(new LLMError(
          signal?.aborted ? 'cancelled' : 'network',
          error instanceof Error ? error.message : String(error)
        )));
      });
    });
  },
};
