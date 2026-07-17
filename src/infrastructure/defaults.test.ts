import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserLlmGateway, runtimeLlmGateway } from './defaults';
import { tauriLlmGateway } from './tauriLlmGateway';

describe('runtime LLM gateway routing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    localStorage.clear();
    delete window.__TAURI_INTERNALS__;
  });

  it.each([
    ['deepseek', '', 'bio_api_key:deepseek', 'deepseek-key'],
    ['openai', '', 'bio_api_key:openai', 'openai-key'],
    [
      'custom',
      'https://gateway.example.com/v1',
      'bio_api_key:custom:https%3A%2F%2Fgateway.example.com',
      'custom-key',
    ],
  ] as const)(
    'loads only the active %s Web API key scope when the draft is empty',
    async (provider, baseUrl, storageKey, apiKey) => {
      localStorage.setItem(storageKey, apiKey);
      const browserStream = vi.spyOn(browserLlmGateway, 'streamText').mockResolvedValue('OK');

      await runtimeLlmGateway.streamText(
        [{ role: 'user', content: 'test' }],
        {
          provider,
          apiKey: '',
          baseUrl,
          model: provider === 'deepseek' ? 'deepseek-chat' : 'compatible-model',
          temperature: 0,
          maxTokens: 16,
          contextWindow: 4096,
          timeout: 1_000,
        }
      );

      expect(browserStream).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ provider, apiKey }),
        undefined,
        undefined
      );
    }
  );

  it('prefers an explicit Web draft key over the saved scope', async () => {
    localStorage.setItem('bio_api_key:openai', 'saved-key');
    const browserStream = vi.spyOn(browserLlmGateway, 'streamText').mockResolvedValue('OK');

    await runtimeLlmGateway.streamText(
      [{ role: 'user', content: 'test' }],
      {
        provider: 'openai',
        apiKey: ' draft-key ',
        baseUrl: '',
        model: 'gpt-4o-mini',
        temperature: 0,
        maxTokens: 16,
        contextWindow: 4096,
        timeout: 1_000,
      }
    );

    expect(browserStream.mock.calls[0][1].apiKey).toBe('draft-key');
  });

  it('does not reuse a custom Web key for another endpoint', async () => {
    localStorage.setItem(
      'bio_api_key:custom:https%3A%2F%2Fgateway.example.com',
      'custom-key'
    );
    const browserStream = vi.spyOn(browserLlmGateway, 'streamText').mockResolvedValue('OK');

    await runtimeLlmGateway.streamText(
      [{ role: 'user', content: 'test' }],
      {
        provider: 'custom',
        apiKey: '',
        baseUrl: 'https://other.example.com/v1',
        model: 'custom-model',
        temperature: 0,
        maxTokens: 16,
        contextWindow: 4096,
        timeout: 1_000,
      }
    );

    expect(browserStream.mock.calls[0][1].apiKey).toBe('');
  });

  it('routes experimental custom providers through the Rust transport', async () => {
    vi.stubEnv('VITE_ENABLE_EXPERIMENTAL_PROVIDERS', 'true');
    window.__TAURI_INTERNALS__ = {};
    const rustStream = vi.spyOn(tauriLlmGateway, 'streamText').mockResolvedValue('OK');
    const browserFetch = vi.spyOn(globalThis, 'fetch');

    await expect(runtimeLlmGateway.streamText(
      [{ role: 'user', content: 'test' }],
      {
        provider: 'custom',
        apiKey: '',
        baseUrl: 'https://gateway.example.com',
        model: 'custom-model',
        temperature: 0,
        maxTokens: 16,
        contextWindow: 4096,
        timeout: 1_000,
      }
    )).resolves.toBe('OK');

    expect(rustStream).toHaveBeenCalledOnce();
    expect(browserFetch).not.toHaveBeenCalled();
  });
});
