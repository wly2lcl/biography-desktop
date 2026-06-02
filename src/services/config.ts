// src/services/config.ts - Configuration management

import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';

export const PRESET_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek（推荐）',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    description: '免费，新用户赠 $5 额度',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    description: '付费，稳定可靠',
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5',
    description: '完全免费，本地运行',
  },
];

/**
 * Load settings from storage
 */
export async function loadSettings(
  getConfig: (key: string) => Promise<string | null>
): Promise<AppSettings> {
  const settings: AppSettings = { ...DEFAULT_SETTINGS };

  try {
    const raw = await getConfig('app_settings');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      Object.assign(settings, parsed);
    }
  } catch {
    // Use defaults
  }

  return settings;
}

/**
 * Save settings to storage
 */
export async function saveSettings(
  setConfig: (key: string, value: string) => Promise<void>,
  settings: AppSettings
): Promise<void> {
  await setConfig('app_settings', JSON.stringify(settings));
}

/**
 * Load API key securely (Tauri: keyring / Web: localStorage)
 */
export async function loadApiKey(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const key = (await invoke('get_api_key')) as string;
    return key || '';
  } catch {
    // Not in Tauri mode
    return '';
  }
}

/**
 * Save API key securely
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_api_key', { apiKey });
  } catch {
    // Not in Tauri mode, fallback to localStorage with warning
    console.warn(
      '[Security] API key stored in localStorage. Use Tauri mode for secure keyring storage.'
    );
    localStorage.setItem('bio_api_key', apiKey);
  }
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
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 15000);
    // Normalize: strip trailing /v1 to avoid duplication
    const normalized = baseUrl.replace(/\/v1\/?$/, '');

    const response = await fetch(`${normalized}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      }),
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  }
}
