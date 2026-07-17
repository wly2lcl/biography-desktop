import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../types/settings';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import {
  loadApiKey,
  isApiKeyConfigured,
  loadSettings,
  providerRequiresApiKey,
  providerRequiresCloudConsent,
  saveApiKey,
  saveSettings,
} from './config';

beforeEach(() => {
  invokeMock.mockReset();
  localStorage.clear();
  delete window.__TAURI__;
  delete window.__TAURI_INTERNALS__;
});

describe('settings persistence boundaries', () => {
  it('merges stable saved settings with defaults', async () => {
    const settings = await loadSettings(async () => JSON.stringify({
      llmProvider: 'openai', model: 'gpt-4o-mini', temperature: 0.2,
    }));
    expect(settings).toMatchObject({
      llmProvider: 'openai', model: 'gpt-4o-mini', temperature: 0.2,
      maxChoices: DEFAULT_SETTINGS.maxChoices,
    });
  });

  it('resets only provider fields for experimental settings in stable builds', async () => {
    const settings = await loadSettings(async () => JSON.stringify({
      llmProvider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'local-model',
      maxChoices: 17,
      summaryThreshold: 9,
    }));
    expect(settings).toMatchObject({
      llmProvider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      maxChoices: 17,
      summaryThreshold: 9,
    });
  });

  it('preserves a custom endpoint for a stable provider', async () => {
    const settings = await loadSettings(async () => JSON.stringify({
      llmProvider: 'openai',
      baseUrl: ' https://gateway.example.com/v1/ ',
      model: 'gateway-model',
    }));
    expect(settings).toMatchObject({
      llmProvider: 'openai',
      baseUrl: 'https://gateway.example.com/v1/',
      model: 'gateway-model',
    });
  });

  it('preserves an empty Base URL so requests can use the provider default', async () => {
    const settings = await loadSettings(async () => JSON.stringify({
      llmProvider: 'openai',
      baseUrl: '   ',
      model: 'gpt-4o-mini',
    }));
    expect(settings).toMatchObject({
      llmProvider: 'openai',
      baseUrl: '',
      model: 'gpt-4o-mini',
    });
  });

  it('keeps a legacy remote HTTP Base URL visible so the user can correct it', async () => {
    const settings = await loadSettings(async () => JSON.stringify({
      llmProvider: 'deepseek',
      baseUrl: 'http://legacy-gateway.example.com/v1',
      model: 'legacy-model',
    }));
    expect(settings).toMatchObject({
      llmProvider: 'deepseek',
      baseUrl: 'http://legacy-gateway.example.com/v1',
      model: 'legacy-model',
    });
  });

  it('requires an actual boolean before accepting cloud privacy consent', async () => {
    const settings = await loadSettings(async () => JSON.stringify({
      cloudPrivacyAcknowledged: 'true',
    }));
    expect(settings.cloudPrivacyAcknowledged).toBe(false);
  });

  it('normalizes malformed numeric settings before they reach the engine', async () => {
    const settings = await loadSettings(async () => JSON.stringify({
      maxChoices: 'many',
      maxAutoContinue: 0,
      llmMaxRetries: -1,
      temperature: 99,
      timeout: null,
    }));
    expect(settings).toMatchObject({
      maxChoices: DEFAULT_SETTINGS.maxChoices,
      maxAutoContinue: DEFAULT_SETTINGS.maxAutoContinue,
      llmMaxRetries: DEFAULT_SETTINGS.llmMaxRetries,
      temperature: 2,
      timeout: DEFAULT_SETTINGS.timeout,
    });
  });

  it('keeps the summary tail below its trigger threshold', async () => {
    const settings = await loadSettings(async () => JSON.stringify({
      summaryThreshold: 5,
      summaryKeepLatest: 999,
    }));
    expect(settings.summaryThreshold).toBe(5);
    expect(settings.summaryKeepLatest).toBe(4);
  });

  it('allows local providers without a key or cloud consent', () => {
    expect(providerRequiresApiKey('deepseek')).toBe(true);
    expect(providerRequiresCloudConsent('openai')).toBe(true);
    expect(providerRequiresApiKey('ollama')).toBe(false);
    expect(providerRequiresCloudConsent('llamacpp_local')).toBe(false);
  });

  it('saves settings only through the explicit writer', async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    await saveSettings(writer, { ...DEFAULT_SETTINGS, apiKey: 'must-not-persist' });
    const stored = JSON.parse(writer.mock.calls[0][1]);
    expect(stored).toMatchObject({ llmProvider: DEFAULT_SETTINGS.llmProvider });
    expect(stored).not.toHaveProperty('apiKey');
  });

  it('discards API keys persisted by older settings versions', async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const settings = await loadSettings(
      async () => JSON.stringify({
        llmProvider: 'openai',
        apiKey: 'legacy-plaintext-key',
      }),
      writer
    );
    expect(settings.apiKey).toBe('');
    expect(JSON.parse(writer.mock.calls[0][1])).not.toHaveProperty('apiKey');
  });
});

describe('API key runtime boundary', () => {
  it('keeps keyring secrets out of the WebView when Tauri exposes only __TAURI_INTERNALS__', async () => {
    window.__TAURI_INTERNALS__ = {};
    localStorage.setItem('bio_api_key', 'insecure-web-copy');
    invokeMock.mockResolvedValueOnce(true).mockResolvedValueOnce(undefined);

    await expect(loadApiKey('deepseek', '')).resolves.toBe('');
    await expect(isApiKeyConfigured('deepseek', '')).resolves.toBe(true);
    await saveApiKey('next-secure-key', 'deepseek', '');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'has_api_key', {
      provider: 'deepseek', baseUrl: '', migrateLegacy: false,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'set_api_key', {
      apiKey: 'next-secure-key',
      provider: 'deepseek',
      baseUrl: '',
    });
    expect(localStorage.getItem('bio_api_key')).toBe('insecure-web-copy');
  });

  it('keeps localStorage limited to the Web development runtime', async () => {
    localStorage.setItem('bio_api_key', 'web-key');
    await expect(loadApiKey('deepseek', '', true)).resolves.toBe('web-key');
    await saveApiKey('updated-web-key', 'deepseek', '');
    expect(localStorage.getItem('bio_api_key')).toBeNull();
    expect(localStorage.getItem('bio_api_key:deepseek')).toBe('updated-web-key');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('migrates a legacy Web key only when the saved provider explicitly requests it', async () => {
    localStorage.setItem('bio_api_key', 'legacy-key');

    await expect(isApiKeyConfigured('openai', '')).resolves.toBe(false);
    expect(localStorage.getItem('bio_api_key')).toBe('legacy-key');
    expect(localStorage.getItem('bio_api_key:openai')).toBeNull();

    await expect(loadApiKey('openai', '', true)).resolves.toBe('legacy-key');
    expect(localStorage.getItem('bio_api_key')).toBeNull();
    expect(localStorage.getItem('bio_api_key:openai')).toBe('legacy-key');
  });

  it('isolates Web keys by stable provider and custom Base URL', async () => {
    await saveApiKey('deepseek-key', 'deepseek', '');
    await saveApiKey('openai-key', 'openai', '');
    await saveApiKey('custom-key', 'custom', 'https://gateway.example.com/v1');

    await expect(loadApiKey('deepseek', '')).resolves.toBe('deepseek-key');
    await expect(loadApiKey('openai', '')).resolves.toBe('openai-key');
    await expect(loadApiKey('custom', 'https://gateway.example.com/'))
      .resolves.toBe('custom-key');
    await expect(loadApiKey('custom', 'https://other.example.com'))
      .resolves.toBe('');
  });

  it('surfaces a Tauri keyring status failure instead of using Web storage', async () => {
    window.__TAURI_INTERNALS__ = {};
    localStorage.setItem('bio_api_key', 'must-not-be-used');
    invokeMock.mockRejectedValue(new Error('keychain unavailable'));

    await expect(loadApiKey('openai', '')).resolves.toBe('');
    await expect(isApiKeyConfigured('openai', '')).rejects.toThrow('无法读取系统钥匙串状态');
    expect(localStorage.getItem('bio_api_key')).toBe('must-not-be-used');
  });
});
