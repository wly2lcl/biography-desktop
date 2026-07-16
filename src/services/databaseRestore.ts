import { getErrorMessage } from '@/utils/errors';

export interface RestoreSessionBackupCallbacks {
  resetCurrentSession: () => void;
  refreshResumeSessions: () => Promise<void>;
  refreshDatabaseInfo: () => Promise<void>;
  refreshBackups: () => Promise<void>;
}

export class DatabaseRestoreRefreshError extends Error {
  constructor(public readonly refreshError: unknown) {
    super('Database restore completed, but the application state could not be refreshed');
    this.name = 'DatabaseRestoreRefreshError';
  }
}

export async function restoreSessionBackup(
  backupPath: string,
  callbacks: RestoreSessionBackupCallbacks
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('restore_database', { backupPath });

  callbacks.resetCurrentSession();
  const refreshResults = await Promise.allSettled([
    callbacks.refreshResumeSessions(),
    callbacks.refreshDatabaseInfo(),
    callbacks.refreshBackups(),
  ]);
  const failedRefresh = refreshResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (failedRefresh) {
    throw new DatabaseRestoreRefreshError(failedRefresh.reason);
  }
}

export function formatDatabaseRestoreError(error: unknown): string {
  if (error instanceof DatabaseRestoreRefreshError) {
    return `数据库恢复已完成，但界面刷新失败，请重新打开应用: ${
      getErrorMessage(error.refreshError, '未知错误')
    }`;
  }
  return `恢复失败，当前数据库未被替换: ${getErrorMessage(error, '未知错误')}`;
}
