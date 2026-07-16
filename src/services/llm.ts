// src/services/llm.ts - Stable cloud LLM adapters and streaming client

import { parseSSE } from '../utils/sse';
import type { LlmProvider } from '../types/settings';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type StableLlmProvider = Extract<LlmProvider, 'deepseek' | 'openai'>;

export const OFFICIAL_PROVIDER_BASE_URLS: Readonly<Record<StableLlmProvider, string>> = {
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
};

export interface LLMConfig {
  provider?: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

export type LLMErrorCode =
  | 'invalid_config'
  | 'authentication'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'server'
  | 'invalid_response'
  | 'cancelled';

export class LLMError extends Error {
  constructor(
    public readonly code: LLMErrorCode,
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export interface LlmProviderAdapter {
  readonly id: LlmProvider;
  createRequest(messages: LLMMessage[], config: LLMConfig, signal: AbortSignal): {
    url: string;
    init: RequestInit;
  };
}

export type LlmBaseUrlValidationResult =
  | { valid: true; resolvedBaseUrl: string }
  | { valid: false; error: string };

const LOOPBACK_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function validateLlmBaseUrl(
  baseUrl: string,
  provider: LlmProvider
): LlmBaseUrlValidationResult {
  const trimmedBaseUrl = baseUrl.trim();
  if (!trimmedBaseUrl) {
    if (provider === 'deepseek' || provider === 'openai') {
      return {
        valid: true,
        resolvedBaseUrl: OFFICIAL_PROVIDER_BASE_URLS[provider],
      };
    }
    return {
      valid: false,
      error: provider === 'llamacpp_local'
        ? '应用内置本地模型尚未启动，请先启动本地服务'
        : '当前提供商必须填写 Base URL',
    };
  }
  const candidate = trimmedBaseUrl;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      valid: false,
      error: 'Base URL 格式无效，请填写完整的 HTTP(S) 地址',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, error: 'Base URL 仅支持 HTTP 或 HTTPS 协议' };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Base URL 不能包含用户名或密码' };
  }
  if (parsed.search || parsed.hash) {
    return { valid: false, error: 'Base URL 不能包含查询参数或片段标识' };
  }
  if (parsed.protocol === 'http:' && !LOOPBACK_HTTP_HOSTS.has(parsed.hostname.toLowerCase())) {
    return {
      valid: false,
      error: '远程 Base URL 必须使用 HTTPS；HTTP 仅允许本机回环地址',
    };
  }

  return { valid: true, resolvedBaseUrl: candidate };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function createOpenAICompatibleAdapter(id: LlmProvider): LlmProviderAdapter {
  return {
    id,
    createRequest(messages, config, signal) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
      const validation = validateLlmBaseUrl(config.baseUrl, id);
      if (!validation.valid) {
        throw new LLMError('invalid_config', validation.error);
      }
      return {
        url: `${normalizeBaseUrl(validation.resolvedBaseUrl)}/v1/chat/completions`,
        init: {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
            stream: true,
          }),
          signal,
        },
      };
    },
  };
}

export const LLM_PROVIDER_ADAPTERS: Readonly<Record<LlmProvider, LlmProviderAdapter>> = {
  deepseek: createOpenAICompatibleAdapter('deepseek'),
  openai: createOpenAICompatibleAdapter('openai'),
  ollama: createOpenAICompatibleAdapter('ollama'),
  llamacpp: createOpenAICompatibleAdapter('llamacpp'),
  llamacpp_local: createOpenAICompatibleAdapter('llamacpp_local'),
  custom: createOpenAICompatibleAdapter('custom'),
};

function selectAdapter(config: LLMConfig): LlmProviderAdapter {
  if (config.provider) {
    const adapter = (
      LLM_PROVIDER_ADAPTERS as Partial<Record<string, LlmProviderAdapter>>
    )[config.provider];
    if (!adapter) {
      throw new LLMError('invalid_config', `不支持的 LLM 提供商：${config.provider}`);
    }
    return adapter;
  }
  if (!config.baseUrl.trim()) {
    throw new LLMError(
      'invalid_config',
      'Base URL 为空时必须明确选择 DeepSeek 或 OpenAI'
    );
  }
  const provider = config.baseUrl.toLowerCase().includes('openai.com')
    ? 'openai'
    : 'deepseek';
  return LLM_PROVIDER_ADAPTERS[provider];
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function responseError(response: Response): Promise<LLMError> {
  let message = `HTTP ${response.status}`;
  try {
    const payload = await response.json() as { error?: { message?: string }; message?: string };
    message = payload.error?.message ?? payload.message ?? message;
  } catch {
    // Status remains the authoritative diagnostic when the body is not JSON.
  }
  if (response.status === 401 || response.status === 403) {
    return new LLMError('authentication', `Authentication failed: ${message}`, response.status);
  }
  if (response.status === 429) {
    return new LLMError(
      'rate_limit',
      message,
      response.status,
      parseRetryAfter(response.headers.get('Retry-After'))
    );
  }
  if (response.status >= 500) return new LLMError('server', message, response.status);
  return new LLMError('invalid_response', `Bad request: ${message}`, response.status);
}

function mapTransportError(error: unknown, timedOut: boolean, externallyCancelled: boolean): LLMError {
  if (error instanceof LLMError) return error;
  if (timedOut) return new LLMError('timeout', 'LLM request timed out');
  if (externallyCancelled) return new LLMError('cancelled', 'LLM request cancelled');
  return new LLMError('network', error instanceof Error ? error.message : 'Network request failed');
}

export async function* streamChat(
  messages: LLMMessage[],
  config: LLMConfig,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeout);
  let receivedContent = false;

  try {
    if (signal?.aborted) controller.abort();
    const request = selectAdapter(config).createRequest(messages, config, controller.signal);
    const response = await fetch(request.url, request.init);
    if (!response.ok) throw await responseError(response);
    if (!response.body) throw new LLMError('invalid_response', 'LLM response body is empty');

    let receivedEvent = false;
    let receivedCompletion = false;
    for await (const event of parseSSE(response)) {
      receivedEvent = true;
      if (event.data.trim() === '[DONE]') {
        receivedCompletion = true;
        break;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        throw new LLMError(
          'invalid_response',
          `Invalid SSE JSON: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
      const choice = (payload as {
        choices?: Array<{
          delta?: { content?: unknown };
          finish_reason?: unknown;
        }>;
      }).choices?.[0];
      const content = choice?.delta?.content;
      if (typeof content === 'string' && content.length > 0) {
        receivedContent = true;
        yield content;
      }
      if (typeof choice?.finish_reason === 'string' && choice.finish_reason.length > 0) {
        receivedCompletion = true;
        break;
      }
    }
    if (!receivedEvent || !receivedContent) {
      throw new LLMError('invalid_response', 'LLM returned an empty streaming response');
    }
    if (!receivedCompletion) {
      throw new LLMError('invalid_response', 'LLM streaming response ended before completion');
    }
  } catch (error) {
    const mapped = mapTransportError(error, timedOut, signal?.aborted === true);
    if (receivedContent && (mapped.code === 'network' || mapped.code === 'timeout')) {
      throw new LLMError(
        'invalid_response',
        'LLM streaming response was interrupted after partial content'
      );
    }
    throw mapped;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function streamChatText(
  messages: LLMMessage[],
  config: LLMConfig,
  onToken?: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  let fullText = '';
  for await (const token of streamChat(messages, config, signal)) {
    fullText += token;
    onToken?.(token);
  }
  return fullText;
}
