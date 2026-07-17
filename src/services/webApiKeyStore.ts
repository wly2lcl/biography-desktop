import type { LlmProvider } from '../types/settings';
import { validateLlmBaseUrl } from './llm';

const LEGACY_WEB_API_KEY = 'bio_api_key';
const WEB_API_KEY_PROVIDERS: ReadonlySet<LlmProvider> = new Set([
  'deepseek',
  'openai',
  'custom',
]);

export function apiKeyStorageScope(provider: LlmProvider, baseUrl: string): string {
  if (provider === 'deepseek' || provider === 'openai') return provider;
  const validation = validateLlmBaseUrl(baseUrl, provider);
  if (!validation.valid) throw new Error(validation.error);
  const parsed = new URL(validation.resolvedBaseUrl);
  let normalized = parsed.toString().replace(/\/+$/, '');
  normalized = normalized.replace(/\/v1$/i, '');
  return `${provider}:${encodeURIComponent(normalized)}`;
}

function webApiKeyStorageKey(provider: LlmProvider, baseUrl: string): string {
  return `${LEGACY_WEB_API_KEY}:${apiKeyStorageScope(provider, baseUrl)}`;
}

export function loadWebApiKey(
  provider: LlmProvider,
  baseUrl: string,
  migrateLegacy = false
): string {
  const scopedKey = webApiKeyStorageKey(provider, baseUrl);
  const current = localStorage.getItem(scopedKey);
  if (current !== null) return current;
  if (migrateLegacy && (provider === 'deepseek' || provider === 'openai')) {
    const legacy = localStorage.getItem(LEGACY_WEB_API_KEY);
    if (legacy !== null) {
      localStorage.removeItem(LEGACY_WEB_API_KEY);
      try {
        localStorage.setItem(scopedKey, legacy);
      } catch (error) {
        try {
          localStorage.setItem(LEGACY_WEB_API_KEY, legacy);
        } catch {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`API Key 迁移失败，且无法恢复旧密钥：${message}`);
        }
        throw error;
      }
      return legacy;
    }
  }
  return '';
}

export function saveWebApiKey(
  apiKey: string,
  provider: LlmProvider,
  baseUrl: string
): void {
  const storageKey = webApiKeyStorageKey(provider, baseUrl);
  if (apiKey) localStorage.setItem(storageKey, apiKey);
  else localStorage.removeItem(storageKey);
}

/** Resolve only the exact active Web provider/endpoint scope at request time. */
export function resolveWebApiKeyForRequest(
  provider: LlmProvider | undefined,
  baseUrl: string,
  explicitApiKey: string
): string {
  const draftKey = explicitApiKey.trim();
  if (draftKey) return draftKey;
  const resolvedProvider = provider ?? 'deepseek';
  if (!WEB_API_KEY_PROVIDERS.has(resolvedProvider)) return '';
  return loadWebApiKey(resolvedProvider, baseUrl);
}
