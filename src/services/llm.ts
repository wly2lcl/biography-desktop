// src/services/llm.ts - LLM client (unified streaming)

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

/**
 * Normalize baseUrl: strip trailing /v1 so we can always append /v1/chat/completions
 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, '');
}

/**
 * Core streaming LLM call - yields tokens one by one
 */
export async function* streamChat(
  messages: LLMMessage[],
  config: LLMConfig
): AsyncGenerator<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        // Ignore JSON parse error
      }
      // 401 should not be retried
      if (response.status === 401) {
        throw new Error(`Authentication failed: ${errorMessage}`);
      }
      // 400 should not be retried
      if (response.status === 400) {
        throw new Error(`Bad request: ${errorMessage}`);
      }
      throw new Error(errorMessage);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Streaming chat that accumulates and returns full text at the end
 * Useful for scenarios where you need the complete text for JSON parsing
 */
export async function streamChatText(
  messages: LLMMessage[],
  config: LLMConfig,
  onToken?: (token: string) => void
): Promise<string> {
  let fullText = '';
  for await (const token of streamChat(messages, config)) {
    fullText += token;
    onToken?.(token);
  }
  return fullText;
}
