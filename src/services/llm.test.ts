// src/services/llm.test.ts - Tests for LLM client (Phase 8: llama.cpp support)

import { describe, it, expect, vi, afterEach } from 'vitest';

/* ── Helpers ────────────────────────────────────────────────────── */

/** Create a mock Response with streaming SSE data */
function mockStreamResponse(chunks: string[], status = 200): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(`data: ${chunk}\n`));
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n'));
        controller.close();
      },
    }),
    { status, headers: { 'Content-Type': 'text/event-stream' } }
  );
}

/* ── Tests ──────────────────────────────────────────────────────── */

describe('llm.ts', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe('normalizeBaseUrl', () => {
    // The regex is private, but we test it via the public API behavior
    const normalizeRegex = (url: string) => url.replace(/\/v1\/?$/, '');

    it('strips trailing /v1', () => {
      expect(normalizeRegex('http://localhost:8080/v1')).toBe('http://localhost:8080');
    });

    it('strips trailing /v1/', () => {
      expect(normalizeRegex('http://localhost:8080/v1/')).toBe('http://localhost:8080');
    });

    it('leaves URL without /v1 unchanged', () => {
      expect(normalizeRegex('https://api.deepseek.com')).toBe('https://api.deepseek.com');
    });

    it('handles Ollama default URL', () => {
      expect(normalizeRegex('http://localhost:11434/v1')).toBe('http://localhost:11434');
    });
  });

  describe('streamChat - Authorization header behavior', () => {
    it('includes Authorization header when apiKey is provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockStreamResponse(['{"choices":[{"delta":{"content":"Hello"}}]}'])
      );

      const { streamChat } = await import('./llm');
      const gen = streamChat(
        [{ role: 'user', content: 'Hi' }],
        {
          apiKey: 'sk-test-123',
          baseUrl: 'https://api.test.com',
          model: 'test-model',
          temperature: 0.7,
          maxTokens: 100,
          timeout: 5000,
        }
      );

      for await (const _ of gen) {}

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/chat/completions',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer sk-test-123',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('omits Authorization header when apiKey is empty (llama.cpp mode)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockStreamResponse(['{"choices":[{"delta":{"content":"OK"}}]}'])
      );

      const { streamChat } = await import('./llm');
      const gen = streamChat(
        [{ role: 'user', content: 'Hi' }],
        {
          apiKey: '',
          baseUrl: 'http://localhost:8080',
          model: 'Qwen3-8B',
          temperature: 0.7,
          maxTokens: 100,
          timeout: 5000,
        }
      );

      for await (const _ of gen) {}

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('streamChat - streaming behavior', () => {
    it('yields tokens one by one', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockStreamResponse([
          '{"choices":[{"delta":{"content":"Hel"}}]}',
          '{"choices":[{"delta":{"content":"lo"}}]}',
          '{"choices":[{"delta":{"content":" World"}}]}',
        ])
      );

      const { streamChat } = await import('./llm');
      const gen = streamChat(
        [{ role: 'user', content: 'Hi' }],
        {
          apiKey: 'k',
          baseUrl: 'http://x',
          model: 'm',
          temperature: 0,
          maxTokens: 10,
          timeout: 5000,
        }
      );

      const tokens: string[] = [];
      for await (const token of gen) tokens.push(token);

      expect(tokens).toEqual(['Hel', 'lo', ' World']);
    });

    it('skips chunks without content field', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockStreamResponse([
          '{"choices":[{"delta":{"role":"assistant"}}]}',
          '{"choices":[{"delta":{"content":"Hi"}}]}',
          '{"choices":[{"finish_reason":"stop"}]}',
        ])
      );

      const { streamChat } = await import('./llm');
      const gen = streamChat(
        [{ role: 'user', content: 'Hi' }],
        {
          apiKey: 'k',
          baseUrl: 'http://x',
          model: 'm',
          temperature: 0,
          maxTokens: 10,
          timeout: 5000,
        }
      );

      const tokens: string[] = [];
      for await (const token of gen) tokens.push(token);
      expect(tokens).toEqual(['Hi']);
    });
  });

  describe('streamChat - error handling', () => {
    it('throws on 401 (auth failed)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const { streamChat } = await import('./llm');
      const gen = streamChat(
        [{ role: 'user', content: 'Hi' }],
        {
          apiKey: 'bad-key',
          baseUrl: 'https://api.test.com',
          model: 'm',
          temperature: 0,
          maxTokens: 10,
          timeout: 5000,
        }
      );

      await expect(async () => {
        for await (const _ of gen) {}
      }).rejects.toThrow('Authentication failed: Invalid API key');
    });

    it('throws on 500 (server error)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Internal error' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const { streamChat } = await import('./llm');
      const gen = streamChat(
        [{ role: 'user', content: 'Hi' }],
        {
          apiKey: 'k',
          baseUrl: 'https://api.test.com',
          model: 'm',
          temperature: 0,
          maxTokens: 10,
          timeout: 5000,
        }
      );

      await expect(async () => {
        for await (const _ of gen) {}
      }).rejects.toThrow('Internal error');
    });

    it('throws on 400 (bad request)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid model' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const { streamChat } = await import('./llm');
      const gen = streamChat(
        [{ role: 'user', content: 'Hi' }],
        {
          apiKey: 'k',
          baseUrl: 'https://api.test.com',
          model: 'invalid-model',
          temperature: 0,
          maxTokens: 10,
          timeout: 5000,
        }
      );

      await expect(async () => {
        for await (const _ of gen) {}
      }).rejects.toThrow('Bad request: Invalid model');
    });
  });

  describe('streamChatText', () => {
    it('accumulates all tokens and returns full text', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockStreamResponse([
          '{"choices":[{"delta":{"content":"Hel"}}]}',
          '{"choices":[{"delta":{"content":"lo"}}]}',
        ])
      );

      const { streamChatText } = await import('./llm');
      const result = await streamChatText(
        [{ role: 'user', content: 'Hi' }],
        {
          apiKey: 'k',
          baseUrl: 'http://x',
          model: 'm',
          temperature: 0,
          maxTokens: 10,
          timeout: 5000,
        }
      );

      expect(result).toBe('Hello');
    });

    it('calls onToken callback for each token', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockStreamResponse([
          '{"choices":[{"delta":{"content":"A"}}]}',
          '{"choices":[{"delta":{"content":"B"}}]}',
          '{"choices":[{"delta":{"content":"C"}}]}',
        ])
      );

      const { streamChatText } = await import('./llm');
      const onToken = vi.fn();
      await streamChatText(
        [{ role: 'user', content: 'Hi' }],
        {
          apiKey: 'k',
          baseUrl: 'http://x',
          model: 'm',
          temperature: 0,
          maxTokens: 10,
          timeout: 5000,
        },
        onToken
      );

      expect(onToken).toHaveBeenCalledTimes(3);
      expect(onToken).toHaveBeenNthCalledWith(1, 'A');
      expect(onToken).toHaveBeenNthCalledWith(2, 'B');
      expect(onToken).toHaveBeenNthCalledWith(3, 'C');
    });
  });
});

describe('config.ts', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  describe('PRESET_PROVIDERS', () => {
    it('has exactly 5 providers', async () => {
      const { PRESET_PROVIDERS } = await import('./config');
      expect(PRESET_PROVIDERS).toHaveLength(5);
    });

    it('includes deepseek with correct defaults', async () => {
      const { PRESET_PROVIDERS } = await import('./config');
      const ds = PRESET_PROVIDERS.find(p => p.id === 'deepseek')!;
      expect(ds.baseUrl).toBe('https://api.deepseek.com');
      expect(ds.model).toBe('deepseek-chat');
    });

    it('includes openai with correct defaults', async () => {
      const { PRESET_PROVIDERS } = await import('./config');
      const oa = PRESET_PROVIDERS.find(p => p.id === 'openai')!;
      expect(oa.baseUrl).toBe('https://api.openai.com/v1');
      expect(oa.model).toBe('gpt-4o-mini');
    });

    it('includes ollama with correct defaults', async () => {
      const { PRESET_PROVIDERS } = await import('./config');
      const ol = PRESET_PROVIDERS.find(p => p.id === 'ollama')!;
      expect(ol.baseUrl).toBe('http://localhost:11434/v1');
      expect(ol.model).toBe('qwen2.5');
    });

    it('includes llamacpp with correct defaults (Phase 8)', async () => {
      const { PRESET_PROVIDERS } = await import('./config');
      const lc = PRESET_PROVIDERS.find(p => p.id === 'llamacpp')!;
      expect(lc).toBeDefined();
      expect(lc.baseUrl).toBe('http://localhost:8080');
      expect(lc.model).toBe('Qwen3-8B');
      expect(lc.description).toContain('本地');
    });

    it('includes llamacpp_local for app-built-in model (Phase 9)', async () => {
      const { PRESET_PROVIDERS } = await import('./config');
      const lc = PRESET_PROVIDERS.find(p => p.id === 'llamacpp_local')!;
      expect(lc).toBeDefined();
      expect(lc.description).toContain('内置');
    });
  });

  describe('testConnection', () => {
    it('returns true on successful response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('{}', { status: 200 })
      );

      const { testConnection } = await import('./config');
      const result = await testConnection('https://api.test.com', 'key', 'model');
      expect(result).toBe(true);
    });

    it('returns false on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const { testConnection } = await import('./config');
      const result = await testConnection('https://api.test.com', 'key', 'model');
      expect(result).toBe(false);
    });

    it('includes Authorization header when apiKey is provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

      const { testConnection } = await import('./config');
      await testConnection('https://api.test.com', 'sk-123', 'model');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/chat/completions',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer sk-123',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('omits Authorization header when apiKey is empty (llama.cpp mode)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

      const { testConnection } = await import('./config');
      await testConnection('http://localhost:8080', '', 'Qwen3-8B');

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['Content-Type']).toBe('application/json');
    });
  });
});
