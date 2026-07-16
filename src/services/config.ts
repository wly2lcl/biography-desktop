// src/services/config.ts - Configuration management

import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { streamChatText } from './llm';
import { isTauriRuntime } from './runtime';

export const EXPERIMENTAL_PROVIDERS_ENABLED =
  import.meta.env.VITE_ENABLE_EXPERIMENTAL_PROVIDERS === 'true';

const STABLE_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek（推荐）',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    description: '云端服务，费用与额度以服务商当前规则为准',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    description: '付费，稳定可靠',
  },
] as const;

const LOCAL_PROVIDERS: ReadonlySet<AppSettings['llmProvider']> = new Set([
  'ollama',
  'llamacpp',
  'llamacpp_local',
]);

const ALL_PROVIDERS: ReadonlySet<AppSettings['llmProvider']> = new Set([
  'deepseek', 'openai', 'ollama', 'llamacpp', 'llamacpp_local', 'custom',
]);

export function providerRequiresApiKey(provider: AppSettings['llmProvider']): boolean {
  return provider === 'deepseek' || provider === 'openai';
}

export function providerRequiresCloudConsent(provider: AppSettings['llmProvider']): boolean {
  return !LOCAL_PROVIDERS.has(provider);
}

const EXPERIMENTAL_PROVIDERS = [
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5',
    description: '完全免费，本地运行',
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp（本地）',
    baseUrl: 'http://localhost:8080',
    model: 'Qwen3-8B',
    description: '完全免费，本地运行',
  },
  {
    id: 'llamacpp_local',
    name: 'llama.cpp（应用内置）',
    baseUrl: '', // Auto-configured when local server starts
    model: '',
    description: '应用内置运行，一键启动',
  },
] as const;

export const PRESET_PROVIDERS = EXPERIMENTAL_PROVIDERS_ENABLED
  ? [...STABLE_PROVIDERS, ...EXPERIMENTAL_PROVIDERS]
  : [...STABLE_PROVIDERS];

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '').toLowerCase();
}

/** Enforce the provider boundary even for imported or legacy settings. */
export function normalizeSettingsForBuild(settings: AppSettings): AppSettings {
  const finiteNumber = (value: unknown, fallback: number, minimum: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= minimum ? value : fallback;
  const integer = (value: unknown, fallback: number, minimum: number): number =>
    Math.floor(finiteNumber(value, fallback, minimum));
  const provider = ALL_PROVIDERS.has(settings.llmProvider)
    ? settings.llmProvider
    : DEFAULT_SETTINGS.llmProvider;
  const summaryThreshold = integer(
    settings.summaryThreshold, DEFAULT_SETTINGS.summaryThreshold, 2
  );
  const summaryKeepLatest = Math.min(
    integer(settings.summaryKeepLatest, DEFAULT_SETTINGS.summaryKeepLatest, 1),
    summaryThreshold - 1
  );
  const sanitized: AppSettings = {
    ...settings,
    llmProvider: provider,
    apiKey: typeof settings.apiKey === 'string' ? settings.apiKey : '',
    baseUrl: typeof settings.baseUrl === 'string' ? settings.baseUrl : DEFAULT_SETTINGS.baseUrl,
    model: typeof settings.model === 'string' ? settings.model.trim() : DEFAULT_SETTINGS.model,
    temperature: Math.min(2, finiteNumber(
      settings.temperature, DEFAULT_SETTINGS.temperature, 0
    )),
    maxTokens: integer(settings.maxTokens, DEFAULT_SETTINGS.maxTokens, 1),
    timeout: integer(settings.timeout, DEFAULT_SETTINGS.timeout, 1),
    cloudPrivacyAcknowledged: settings.cloudPrivacyAcknowledged === true,
    maxChoices: integer(settings.maxChoices, DEFAULT_SETTINGS.maxChoices, 1),
    maxAutoContinue: integer(settings.maxAutoContinue, DEFAULT_SETTINGS.maxAutoContinue, 1),
    summaryThreshold,
    summaryKeepLatest,
    maxQaHistory: integer(settings.maxQaHistory, DEFAULT_SETTINGS.maxQaHistory, 1),
    maxScenariosInMemory: integer(
      settings.maxScenariosInMemory, DEFAULT_SETTINGS.maxScenariosInMemory, 1
    ),
    worldCacheTTL: integer(settings.worldCacheTTL, DEFAULT_SETTINGS.worldCacheTTL, 1),
    worldCacheMaxSize: integer(
      settings.worldCacheMaxSize, DEFAULT_SETTINGS.worldCacheMaxSize, 1
    ),
    worldMaxChars: integer(settings.worldMaxChars, DEFAULT_SETTINGS.worldMaxChars, 1),
    maxSessionsInList: integer(
      settings.maxSessionsInList, DEFAULT_SETTINGS.maxSessionsInList, 1
    ),
    llmMaxRetries: integer(settings.llmMaxRetries, DEFAULT_SETTINGS.llmMaxRetries, 0),
  };

  if (EXPERIMENTAL_PROVIDERS_ENABLED) return sanitized;

  const preset = STABLE_PROVIDERS.find((candidate) => candidate.id === sanitized.llmProvider)
    ?? STABLE_PROVIDERS[0];
  const savedBaseUrl = sanitized.baseUrl;
  const savedModel = sanitized.model;
  const usesOfficialEndpoint = sanitized.llmProvider === preset.id
    && normalizeUrl(savedBaseUrl) === normalizeUrl(preset.baseUrl);

  return {
    ...sanitized,
    llmProvider: preset.id,
    baseUrl: preset.baseUrl,
    model: usesOfficialEndpoint && savedModel ? savedModel : preset.model,
    apiKey: sanitized.llmProvider === preset.id ? sanitized.apiKey : '',
  };
}

/**
 * Load settings from storage
 */
export async function loadSettings(
  getConfig: (key: string) => Promise<string | null>,
  setConfig?: (key: string, value: string) => Promise<void>
): Promise<AppSettings> {
  const settings: AppSettings = { ...DEFAULT_SETTINGS };

  try {
    const raw = await getConfig('app_settings');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      // API keys from older versions must not be revived from general settings storage.
      const hadLegacyApiKey = Object.prototype.hasOwnProperty.call(parsed, 'apiKey');
      delete parsed.apiKey;
      Object.assign(settings, parsed);
      settings.cloudPrivacyAcknowledged = parsed.cloudPrivacyAcknowledged === true;
      if (hadLegacyApiKey && setConfig) {
        try {
          await setConfig('app_settings', JSON.stringify(parsed));
        } catch {
          // Keep the in-memory key boundary even if legacy storage cleanup fails.
        }
      }
    }
  } catch {
    // Use defaults
  }

  return normalizeSettingsForBuild(settings);
}

/**
 * Save settings to storage
 */
export async function saveSettings(
  setConfig: (key: string, value: string) => Promise<void>,
  settings: AppSettings
): Promise<void> {
  const persisted: Partial<AppSettings> = { ...normalizeSettingsForBuild(settings) };
  delete persisted.apiKey;
  await setConfig('app_settings', JSON.stringify(persisted));
}

/**
 * Load API key securely (Tauri: keyring / Web: localStorage)
 */
export async function loadApiKey(): Promise<string> {
  if (!isTauriRuntime()) return localStorage.getItem('bio_api_key') ?? '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const key = (await invoke('get_api_key')) as string;
    return key || '';
  } catch {
    throw new Error('无法从系统钥匙串读取 API Key');
  }
}

/**
 * Save API key securely
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  if (!isTauriRuntime()) {
    console.warn(
      '[Security] API key stored in localStorage. Use Tauri mode for secure keyring storage.'
    );
    localStorage.setItem('bio_api_key', apiKey);
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_api_key', { apiKey });
}

/**
 * Test LLM connection by sending a minimal request
 */
export async function testConnection(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<boolean> {
  try {
    await streamChatText(
      [{ role: 'user', content: '仅回复 OK' }],
      { apiKey, baseUrl, model, temperature: 0, maxTokens: 8, timeout: 15000 }
    );
    return true;
  } catch {
    return false;
  }
}
