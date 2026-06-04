export interface Choice {
  id: string;
  text: string;
  description?: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  choices: Choice[];
  context?: string;
}

export interface HistoryEntry {
  scenario: string;
  scenarioDescription: string;
  choice: string;
  choiceId: string;
}

export interface QAMessage {
  role: 'user' | 'assistant';
  content: string;
  id?: string;
}

export interface PlayerState {
  name: string;
  currentScenario: string;
  history: HistoryEntry[];
  attributes: Record<string, number>;
  inventory: string[];
  summary: string;
  qaHistory: QAMessage[];
  createdAt: string;
}

/** Reason why a journey ended */
export type EndReason = 'player_ended' | 'story_ending' | 'max_choices' | 'max_history';

export interface GameSession {
  sessionId: string;
  world: string;
  gameMode: 'basic' | 'system';
  system?: string;
  player: PlayerState;
  scenarios: Scenario[];
  isActive: boolean;
  endReason?: EndReason;
  biography?: string;
  createdAt: string;
}

export interface SystemProposal {
  id: string;
  title: string;
  description: string;
  abilities: string;
}

export interface WorldInfo {
  name: string;
  filename: string;
  description: string;
  preview?: string;
}

export interface SessionSummary {
  sessionId: string;
  world: string;
  playerName: string;
  isActive: boolean;
  historyLength: number;
  createdAt: string;
}

export interface ChoiceResponse {
  scenario: Scenario;
  sessionId: string;
  isActive: boolean;
  history: HistoryEntry[];
  historyLength: number;
}

export interface AppConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

// Phase 9: Local model management types

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  size_gb: number;
  quantization: string;
  recommended: boolean;
  download_url: string;
  min_ram_gb: number;
}

export interface DownloadedModel {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  downloaded_at: string;
}

export interface ServerStatus {
  is_running: boolean;
  pid: number | null;
  port: number | null;
  model_name: string | null;
  context_size: number | null;
  gpu_layers: number | null;
}

export interface ServerInfo {
  pid: number;
  port: number;
  model_path: string;
  model_name: string;
  started_at: string;
}
