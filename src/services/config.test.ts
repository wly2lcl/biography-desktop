import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../types/settings';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import {
  loadApiKey,
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

  it('resets a custom endpoint disguised as a stable provider', async () => {
    const settings = await loadSettings(async () => JSON.stringify({
      llmProvider: 'openai',
      baseUrl: 'http://localhost:11434/v1',
      model: 'local-model',
    }));
    expect(settings).toMatchObject({
      llmProvider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
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
  it('uses the keyring when Tauri 2 exposes only __TAURI_INTERNALS__', async () => {
    window.__TAURI_INTERNALS__ = {};
    localStorage.setItem('bio_api_key', 'insecure-web-copy');
    invokeMock.mockResolvedValueOnce('secure-key').mockResolvedValueOnce(undefined);

    await expect(loadApiKey()).resolves.toBe('secure-key');
    await saveApiKey('next-secure-key');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'get_api_key');
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'set_api_key', {
      apiKey: 'next-secure-key',
    });
    expect(localStorage.getItem('bio_api_key')).toBe('insecure-web-copy');
  });

  it('keeps localStorage limited to the Web development runtime', async () => {
    localStorage.setItem('bio_api_key', 'web-key');
    await expect(loadApiKey()).resolves.toBe('web-key');
    await saveApiKey('updated-web-key');
    expect(localStorage.getItem('bio_api_key')).toBe('updated-web-key');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('surfaces a Tauri keyring read failure instead of using Web storage', async () => {
    window.__TAURI_INTERNALS__ = {};
    localStorage.setItem('bio_api_key', 'must-not-be-used');
    invokeMock.mockRejectedValue(new Error('keychain unavailable'));

    await expect(loadApiKey()).rejects.toThrow('无法从系统钥匙串读取 API Key');
    expect(localStorage.getItem('bio_api_key')).toBe('must-not-be-used');
  });
});
