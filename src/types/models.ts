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
