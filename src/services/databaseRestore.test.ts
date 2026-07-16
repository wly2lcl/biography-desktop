import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import {
  DatabaseRestoreRefreshError,
  formatDatabaseRestoreError,
  restoreSessionBackup,
  type RestoreSessionBackupCallbacks,
} from './databaseRestore';

describe('restoreSessionBackup', () => {
  let callbacks: RestoreSessionBackupCallbacks;

  beforeEach(() => {
    invokeMock.mockReset();
    callbacks = {
      resetCurrentSession: vi.fn(),
      refreshResumeSessions: vi.fn().mockResolvedValue(undefined),
      refreshDatabaseInfo: vi.fn().mockResolvedValue(undefined),
      refreshBackups: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('reports an IPC failure as an unchanged database and skips refresh', async () => {
    const failure = new Error('restore rejected');
    invokeMock.mockRejectedValueOnce(failure);

    await expect(restoreSessionBackup('/managed/backups/backup.db', callbacks))
      .rejects.toBe(failure);
    expect(callbacks.resetCurrentSession).not.toHaveBeenCalled();
    expect(callbacks.refreshResumeSessions).not.toHaveBeenCalled();
    expect(formatDatabaseRestoreError(failure)).toContain('恢复失败，当前数据库未被替换');
  });

  it.each([
    'refreshResumeSessions',
    'refreshDatabaseInfo',
    'refreshBackups',
  ] as const)(
    'reports %s failure without claiming the completed restore was rolled back',
    async (callbackName) => {
      invokeMock.mockResolvedValueOnce('Database restored successfully');
      const refreshFailure = new Error(`${callbackName} failed`);
      vi.mocked(callbacks[callbackName]).mockRejectedValueOnce(refreshFailure);

      let caught: unknown;
      try {
        await restoreSessionBackup('/managed/backups/backup.db', callbacks);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(DatabaseRestoreRefreshError);
      expect(callbacks.resetCurrentSession).toHaveBeenCalledOnce();
      expect(formatDatabaseRestoreError(caught)).toContain(
        '数据库恢复已完成，但界面刷新失败'
      );
      expect(formatDatabaseRestoreError(caught)).not.toContain('当前数据库未被替换');
    }
  );

  it('waits for every strict refresh before releasing a failed restore flow', async () => {
    invokeMock.mockResolvedValueOnce('Database restored successfully');
    let finishDatabaseRefresh: (() => void) | undefined;
    vi.mocked(callbacks.refreshResumeSessions).mockRejectedValueOnce(
      new Error('resume refresh failed')
    );
    vi.mocked(callbacks.refreshDatabaseInfo).mockImplementationOnce(
      () => new Promise<void>((resolve) => { finishDatabaseRefresh = resolve; })
    );

    let settled = false;
    const restore = restoreSessionBackup('/managed/backups/backup.db', callbacks)
      .catch(() => undefined)
      .then(() => { settled = true; });
    await vi.waitFor(() => {
      expect(callbacks.refreshBackups).toHaveBeenCalledOnce();
    });

    expect(settled).toBe(false);
    finishDatabaseRefresh?.();
    await restore;
    expect(settled).toBe(true);
  });

  it('refreshes session and database views after a successful restore', async () => {
    invokeMock.mockResolvedValueOnce('Database restored successfully');

    await restoreSessionBackup('/managed/backups/backup.db', callbacks);

    expect(invokeMock).toHaveBeenCalledWith('restore_database', {
      backupPath: '/managed/backups/backup.db',
    });
    expect(callbacks.resetCurrentSession).toHaveBeenCalledOnce();
    expect(callbacks.refreshResumeSessions).toHaveBeenCalledOnce();
    expect(callbacks.refreshDatabaseInfo).toHaveBeenCalledOnce();
    expect(callbacks.refreshBackups).toHaveBeenCalledOnce();
  });
});
