// src/services/storage.ts - Storage abstraction (Web + Tauri)

import {
  SESSION_SCHEMA_VERSION,
  type GameSession,
  type QAMessage,
  type Scenario,
  type WorldRef,
} from '../types/models';
import { resolveWorldRef } from './world';
import { isTauriRuntime } from './runtime';

export class SessionCorruptedError extends Error {
  constructor(message: string) {
    super(`会话数据损坏：${message}`);
    this.name = 'SessionCorruptedError';
  }
}

export interface CorruptedSessionInfo {
  sessionId: string;
  error: string;
}

export interface SessionListResult {
  sessions: GameSession[];
  corruptedSessions: CorruptedSessionInfo[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWorldRef(value: unknown): value is WorldRef {
  if (!isRecord(value)) return false;
  return typeof value.name === 'string' && value.name.trim().length > 0
    && (value.source === 'builtin' || value.source === 'user')
    && (value.type === 'single' || value.type === 'directory');
}

const END_REASONS = new Set([
  'player_ended',
  'story_ending',
  'max_choices',
  'max_history',
]);

const LLM_PROVIDERS = new Set([
  'deepseek', 'openai', 'ollama', 'llamacpp', 'llamacpp_local', 'custom',
]);

export async function normalizeSession(value: unknown): Promise<GameSession> {
  if (!isRecord(value)) throw new SessionCorruptedError('根对象不是对象');
  if (typeof value.sessionId !== 'string' || !value.sessionId) {
    throw new SessionCorruptedError('缺少 sessionId');
  }
  if (typeof value.world !== 'string' || !value.world) {
    throw new SessionCorruptedError('缺少世界观标识');
  }
  if (value.gameMode !== 'basic' && value.gameMode !== 'system') {
    throw new SessionCorruptedError('游戏模式无效');
  }
  if (typeof value.isActive !== 'boolean') {
    throw new SessionCorruptedError('会话活动状态无效');
  }
  if (!isRecord(value.player) || typeof value.player.name !== 'string' || !value.player.name) {
    throw new SessionCorruptedError('玩家数据无效');
  }
  if (!Array.isArray(value.scenarios) || value.scenarios.length === 0
    || !Array.isArray(value.player.history)) {
    throw new SessionCorruptedError('场景为空或历史格式无效');
  }
  if (!isRecord(value.player.attributes) || !Array.isArray(value.player.inventory)
    || (value.player.summary !== undefined && typeof value.player.summary !== 'string')
    || (value.player.qaHistory !== undefined && !Array.isArray(value.player.qaHistory))) {
    throw new SessionCorruptedError('玩家属性、物品、摘要或问答格式无效');
  }
  if (value.player.history.some((entry) => !isRecord(entry)
    || typeof entry.scenario !== 'string'
    || typeof entry.scenarioDescription !== 'string'
    || typeof entry.choice !== 'string'
    || typeof entry.choiceId !== 'string')
    || Object.values(value.player.attributes).some(
      (attribute) => typeof attribute !== 'number' || !Number.isFinite(attribute)
    )
    || value.player.inventory.some((item) => typeof item !== 'string')
    || (Array.isArray(value.player.qaHistory) && value.player.qaHistory.some((message) =>
      !isRecord(message)
      || (message.role !== 'user' && message.role !== 'assistant')
      || typeof message.content !== 'string'
      || (message.id !== undefined && typeof message.id !== 'string')))) {
    throw new SessionCorruptedError('玩家历史、属性值、物品或问答条目无效');
  }
  if (typeof value.createdAt !== 'string' || !value.createdAt
    || (value.system !== undefined && value.system !== null
      && typeof value.system !== 'string')
    || (value.biography !== undefined && value.biography !== null
      && typeof value.biography !== 'string')) {
    throw new SessionCorruptedError('会话时间、系统设定或传记格式无效');
  }
  if (value.biographyGeneration !== undefined && value.biographyGeneration !== null
    && (!isRecord(value.biographyGeneration)
      || typeof value.biographyGeneration.provider !== 'string'
      || !LLM_PROVIDERS.has(value.biographyGeneration.provider)
      || typeof value.biographyGeneration.model !== 'string'
      || !value.biographyGeneration.model
      || typeof value.biographyGeneration.generatedAt !== 'string'
      || !value.biographyGeneration.generatedAt)) {
    throw new SessionCorruptedError('传记生成元数据无效');
  }

  if (value.schemaVersion !== undefined
    && value.schemaVersion !== 1
    && value.schemaVersion !== SESSION_SCHEMA_VERSION) {
    throw new SessionCorruptedError(`不支持的 schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (value.endReason !== undefined && value.endReason !== null
    && (typeof value.endReason !== 'string' || !END_REASONS.has(value.endReason))) {
    throw new SessionCorruptedError('结束原因无效');
  }

  let worldRef: WorldRef;
  if (value.schemaVersion === SESSION_SCHEMA_VERSION) {
    if (!isWorldRef(value.worldRef)) {
      throw new SessionCorruptedError('schema v2 缺少有效 WorldRef');
    }
    worldRef = value.worldRef;
  } else {
    worldRef = await resolveWorldRef(value.world);
  }
  const scenarios = value.scenarios as Scenario[];
  if (scenarios.some((scenario) => !isRecord(scenario)
    || typeof scenario.id !== 'string' || !scenario.id
    || typeof scenario.title !== 'string'
    || typeof scenario.description !== 'string'
    || (scenario.context !== undefined && typeof scenario.context !== 'string')
    || !Array.isArray(scenario.choices)
    || scenario.choices.some((choice) => !isRecord(choice)
      || typeof choice.id !== 'string' || !choice.id
      || typeof choice.text !== 'string' || !choice.text
      || (choice.description !== undefined && typeof choice.description !== 'string')))) {
    throw new SessionCorruptedError('场景条目格式无效');
  }
  const lastScenario = scenarios[scenarios.length - 1];
  const player = value.player as unknown as GameSession['player'];
  const currentScenario = typeof player.currentScenario === 'string'
    && scenarios.some((scenario) => scenario.id === player.currentScenario)
    ? player.currentScenario
    : lastScenario.id;

  return {
    ...(value as unknown as GameSession),
    schemaVersion: SESSION_SCHEMA_VERSION,
    world: worldRef.name,
    worldRef,
    system: typeof value.system === 'string' ? value.system : undefined,
    endReason: typeof value.endReason === 'string'
      ? value.endReason as GameSession['endReason']
      : undefined,
    biography: typeof value.biography === 'string' ? value.biography : undefined,
    biographyGeneration: isRecord(value.biographyGeneration)
      ? value.biographyGeneration as unknown as GameSession['biographyGeneration']
      : undefined,
    player: {
      ...player,
      currentScenario,
      createdAt: typeof player.createdAt === 'string' && player.createdAt
        ? player.createdAt : value.createdAt,
      summary: typeof player.summary === 'string' ? player.summary : '',
      qaHistory: Array.isArray(player.qaHistory) ? player.qaHistory : [],
    },
  };
}

async function parseStoredSession(raw: string): Promise<GameSession> {
  try {
    return await normalizeSession(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SessionCorruptedError) throw error;
    throw new SessionCorruptedError(error instanceof Error ? error.message : 'JSON 无效');
  }
}

export interface StorageProvider {
  saveSession(session: GameSession): Promise<void>;
  getSession(sessionId: string): Promise<GameSession | null>;
  listSessions(activeOnly?: boolean): Promise<GameSession[]>;
  listSessionsDetailed(activeOnly?: boolean): Promise<SessionListResult>;
  deleteSession(sessionId: string): Promise<boolean>;
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string): Promise<void>;
  getQaHistory(sessionId: string, page?: number, pageSize?: number): Promise<QAMessage[]>;
}

// ── Web Storage (localStorage) ─────────────────────────────────────

class WebStorage implements StorageProvider {
  private prefix = 'bio_';

  async saveSession(session: GameSession): Promise<void> {
    const normalized = await normalizeSession(session);
    localStorage.setItem(
      `${this.prefix}session_${normalized.sessionId}`,
      JSON.stringify(normalized)
    );
    // Persist qaHistory separately for paginated retrieval
    localStorage.setItem(
      `${this.prefix}qa_${normalized.sessionId}`,
      JSON.stringify(normalized.player.qaHistory)
    );
  }

  async getSession(sessionId: string): Promise<GameSession | null> {
    const raw = localStorage.getItem(`${this.prefix}session_${sessionId}`);
    return raw ? parseStoredSession(raw) : null;
  }

  async getQaHistory(sessionId: string, page?: number, pageSize?: number): Promise<QAMessage[]> {
    const raw = localStorage.getItem(`${this.prefix}qa_${sessionId}`);
    if (!raw) return [];
    const all: QAMessage[] = JSON.parse(raw);
    if (page === undefined || pageSize === undefined) return all;
    const start = (page - 1) * pageSize;
    return all.slice(start, start + pageSize);
  }

  async listSessions(activeOnly?: boolean): Promise<GameSession[]> {
    return (await this.listSessionsDetailed(activeOnly)).sessions;
  }

  async listSessionsDetailed(activeOnly?: boolean): Promise<SessionListResult> {
    const sessions: GameSession[] = [];
    const corruptedSessions: CorruptedSessionInfo[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${this.prefix}session_`)) {
        try {
          const session = await parseStoredSession(localStorage.getItem(key)!);
          if (!activeOnly || session.isActive) {
            sessions.push(session);
          }
        } catch (error) {
          corruptedSessions.push({
            sessionId: key.slice(`${this.prefix}session_`.length),
            error: error instanceof Error ? error.message : '会话数据损坏',
          });
        }
      }
    }
    sessions.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { sessions, corruptedSessions };
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const key = `${this.prefix}session_${sessionId}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      localStorage.removeItem(`${this.prefix}qa_${sessionId}`);
      return true;
    }
    return false;
  }

  async getConfig(key: string): Promise<string | null> {
    return localStorage.getItem(`${this.prefix}config_${key}`);
  }

  async setConfig(key: string, value: string): Promise<void> {
    localStorage.setItem(`${this.prefix}config_${key}`, value);
  }
}

// ── Tauri Storage (IPC) ────────────────────────────────────────────

class TauriStorage implements StorageProvider {
  private async invoke(command: string, args: Record<string, unknown> = {}) {
    // Dynamic import to avoid issues in web mode
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke(command, args);
  }

  async saveSession(session: GameSession): Promise<void> {
    await this.invoke('save_session', { session: await normalizeSession(session) });
  }

  async getSession(sessionId: string): Promise<GameSession | null> {
    const session = await this.invoke('get_session', {
      sessionId,
    });
    return session ? normalizeSession(session) : null;
  }

  async getQaHistory(sessionId: string, page?: number, pageSize?: number): Promise<QAMessage[]> {
    const session = await this.getSession(sessionId);
    if (!session) return [];
    const all = session.player.qaHistory || [];
    if (page === undefined || pageSize === undefined) return all;
    const start = (page - 1) * pageSize;
    return all.slice(start, start + pageSize);
  }

  async listSessions(activeOnly = false): Promise<GameSession[]> {
    return (await this.listSessionsDetailed(activeOnly)).sessions;
  }

  async listSessionsDetailed(activeOnly = false): Promise<SessionListResult> {
    const result = await this.invoke('list_sessions', {
      activeOnly,
    });
    if (!isRecord(result) || !Array.isArray(result.sessions)
      || !Array.isArray(result.corruptedSessions)) {
      throw new Error('会话列表响应格式无效');
    }

    const sessions: GameSession[] = [];
    const corruptedSessions: CorruptedSessionInfo[] = result.corruptedSessions
      .filter(isRecord)
      .map((entry) => ({
        sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : 'unknown',
        error: typeof entry.error === 'string' ? entry.error : '会话数据损坏',
      }));
    for (const value of result.sessions) {
      try {
        sessions.push(await normalizeSession(value));
      } catch (error) {
        const record = isRecord(value) ? value : {};
        corruptedSessions.push({
          sessionId: typeof record.sessionId === 'string' ? record.sessionId : 'unknown',
          error: error instanceof Error ? error.message : '会话数据损坏',
        });
      }
    }
    return { sessions, corruptedSessions };
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return (await this.invoke('delete_session', {
      sessionId,
    })) as boolean;
  }

  async getConfig(key: string): Promise<string | null> {
    return (await this.invoke('get_config', { key })) as string | null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.invoke('set_config', { key, value });
  }
}

// ── Factory ────────────────────────────────────────────────────────

export function createStorage(): StorageProvider {
  return isTauriRuntime() ? new TauriStorage() : new WebStorage();
}
