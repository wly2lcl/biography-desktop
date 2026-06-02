// src/services/storage.ts - Storage abstraction (Web + Tauri)

import type { GameSession, QAMessage } from '../types/models';

export interface StorageProvider {
  saveSession(session: GameSession): Promise<void>;
  getSession(sessionId: string): Promise<GameSession | null>;
  listSessions(activeOnly?: boolean): Promise<GameSession[]>;
  deleteSession(sessionId: string): Promise<boolean>;
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string): Promise<void>;
  getQaHistory(sessionId: string, page?: number, pageSize?: number): Promise<QAMessage[]>;
}

// ── Web Storage (localStorage) ─────────────────────────────────────

class WebStorage implements StorageProvider {
  private prefix = 'bio_';

  async saveSession(session: GameSession): Promise<void> {
    localStorage.setItem(
      `${this.prefix}session_${session.sessionId}`,
      JSON.stringify(session)
    );
    // Persist qaHistory separately for paginated retrieval
    localStorage.setItem(
      `${this.prefix}qa_${session.sessionId}`,
      JSON.stringify(session.player.qaHistory)
    );
  }

  async getSession(sessionId: string): Promise<GameSession | null> {
    const raw = localStorage.getItem(`${this.prefix}session_${sessionId}`);
    return raw ? (JSON.parse(raw) as GameSession) : null;
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
    const sessions: GameSession[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${this.prefix}session_`)) {
        const session = JSON.parse(localStorage.getItem(key)!);
        if (!activeOnly || session.isActive) {
          sessions.push(session);
        }
      }
    }
    return sessions.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const key = `${this.prefix}session_${sessionId}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
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
    await this.invoke('save_session', { session });
  }

  async getSession(sessionId: string): Promise<GameSession | null> {
    return (await this.invoke('get_session', {
      sessionId,
    })) as GameSession | null;
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
    return (await this.invoke('list_sessions', {
      activeOnly,
    })) as GameSession[];
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

function isTauri(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}

export function createStorage(): StorageProvider {
  return isTauri() ? new TauriStorage() : new WebStorage();
}
