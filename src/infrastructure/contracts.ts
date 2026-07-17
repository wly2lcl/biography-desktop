import type { GameSession, WorldInfo, WorldRef } from '../types/models';
import type { LLMConfig, LLMMessage } from '../services/llm';
import type { SessionListResult } from '../services/storage';

export interface SessionRepository {
  saveSession(session: GameSession): Promise<void>;
  getSession(sessionId: string): Promise<GameSession | null>;
  listSessions(activeOnly?: boolean): Promise<GameSession[]>;
  listSessionsDetailed(activeOnly?: boolean): Promise<SessionListResult>;
  deleteSession(sessionId: string): Promise<boolean>;
  getQaHistory(
    sessionId: string,
    page?: number,
    pageSize?: number
  ): Promise<GameSession['player']['qaHistory']>;
}

export interface SettingsRepository {
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string): Promise<void>;
}

export interface DatabaseInfo {
  path: string;
  size: number;
  sessionCount: number;
  activeCount: number;
}

export interface BackupInfo {
  path: string;
  filename: string;
  size: number;
  modified: string;
}

export interface DesktopDataGateway {
  getInfo(): Promise<DatabaseInfo>;
  listBackups(): Promise<BackupInfo[]>;
  backup(): Promise<string>;
  restore(backupPath: string): Promise<void>;
  deleteBackup(backupPath: string): Promise<void>;
  clearEndedSessions(): Promise<number>;
  clearAllSessions(): Promise<number>;
  exportAll(): Promise<string>;
  importAll(data: string): Promise<string>;
}

export interface WorldRepository {
  list(): Promise<WorldInfo[]>;
  getContext(ref: WorldRef): Promise<string>;
}

export interface LlmGateway {
  streamText(
    messages: LLMMessage[],
    config: LLMConfig,
    onToken?: (token: string) => void,
    signal?: AbortSignal
  ): Promise<string>;
}

export interface GameEngineDependencies {
  llm: LlmGateway;
  worlds: WorldRepository;
}
