export type LlmProvider =
  | 'deepseek'
  | 'openai'
  | 'ollama'
  | 'llamacpp'
  | 'llamacpp_local'
  | 'custom';

export interface AppSettings {
  // LLM
  llmProvider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  timeout: number;
  cloudPrivacyAcknowledged: boolean;

  // Game parameters
  maxChoices: number;
  maxAutoContinue: number;
  summaryThreshold: number;
  summaryKeepLatest: number;
  maxQaHistory: number;
  maxScenariosInMemory: number;
  worldCacheTTL: number;
  worldCacheMaxSize: number;
  worldMaxChars: number;
  maxSessionsInList: number;
  llmMaxRetries: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.8,
  maxTokens: 4096,
  contextWindow: 65536,
  timeout: 120000,
  cloudPrivacyAcknowledged: false,
  maxChoices: 30,
  maxAutoContinue: 5,
  summaryThreshold: 15,
  summaryKeepLatest: 10,
  maxQaHistory: 20,
  maxScenariosInMemory: 2,
  worldCacheTTL: 300,
  worldCacheMaxSize: 20,
  worldMaxChars: 50000,
  maxSessionsInList: 50,
  llmMaxRetries: 3,
};
