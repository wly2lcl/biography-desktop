import { useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { isTauriRuntime } from '@/services/runtime';
import { getErrorMessage } from '@/utils/errors';
import { formatDatabaseRestoreError, restoreSessionBackup } from '@/services/databaseRestore';
import { desktopDataGateway } from '@/infrastructure/desktopDataGateway';
import type { BackupInfo, DatabaseInfo } from '@/infrastructure/contracts';

export default function DataTab({
  dbInfo,
  backups,
  degradedMode,
  onRefresh,
  onRefreshBackups,
  onRefreshStrict,
  onRefreshBackupsStrict,
  dataActionsDisabled,
}: {
  dbInfo: DatabaseInfo | null;
  backups: BackupInfo[];
  degradedMode: boolean;
  onRefresh: () => Promise<void>;
  onRefreshBackups: () => Promise<void>;
  onRefreshStrict: () => Promise<void>;
  onRefreshBackupsStrict: () => Promise<void>;
  dataActionsDisabled: boolean;
}) {
  const desktopAvailable = isTauriRuntime();
  const handleBackup = useCallback(async () => {
    try {
      const backupPath = await desktopDataGateway.backup();
      alert(`备份成功！\n文件位置: ${backupPath}`);
      await Promise.all([onRefresh(), onRefreshBackups()]);
    } catch (err) {
      alert(`备份失败: ${getErrorMessage(err, '未知错误')}`);
    }
  }, [onRefresh, onRefreshBackups]);

  const handleRestore = useCallback(async (backup: BackupInfo) => {
    if (!window.confirm(
      `确定恢复「${backup.filename}」吗？当前会话将被备份内容替换，现有设置和 API Key 会保留。`
    )) return;
    const store = useGameStore.getState();
    let prepared = false;
    try {
      await store.prepareForDataMutation();
      prepared = true;
      await restoreSessionBackup(backup.path, {
        resetCurrentSession: store.newGame,
        refreshResumeSessions: () => store.checkResume({ throwOnError: true }),
        refreshDatabaseInfo: onRefreshStrict,
        refreshBackups: onRefreshBackupsStrict,
      });
      alert('数据库恢复成功，当前设置和 API Key 已保留');
    } catch (err) {
      alert(formatDatabaseRestoreError(err));
    } finally {
      if (prepared) store.finishDataMutation();
    }
  }, [onRefreshStrict, onRefreshBackupsStrict]);

  const handleDeleteBackup = useCallback(async (backup: BackupInfo) => {
    if (!window.confirm(`确定删除备份「${backup.filename}」吗？`)) return;
    try {
      await desktopDataGateway.deleteBackup(backup.path);
      await onRefreshBackups();
    } catch (err) {
      alert(`删除备份失败: ${getErrorMessage(err, '未知错误')}`);
    }
  }, [onRefreshBackups]);

  const handleCleanup = useCallback(async () => {
    if (!window.confirm('确定永久删除所有已结束会话及其传记吗？')) return;
    const store = useGameStore.getState();
    let prepared = false;
    try {
      await store.prepareForDataMutation();
      prepared = true;
      const count = await desktopDataGateway.clearEndedSessions();
      if (store.session && !store.session.isActive) store.newGame();
      await store.checkResume();
      alert(`已清理 ${count} 个已结束会话`);
      await onRefresh();
    } catch (err) {
      alert(`清理失败: ${getErrorMessage(err, '未知错误')}`);
    } finally {
      if (prepared) store.finishDataMutation();
    }
  }, [onRefresh]);

  const handleCleanupAll = useCallback(async () => {
    if (!window.confirm('确定永久删除全部会话吗？此操作无法撤销。')) return;
    const store = useGameStore.getState();
    let prepared = false;
    try {
      await store.prepareForDataMutation();
      prepared = true;
      const count = await desktopDataGateway.clearAllSessions();
      store.newGame();
      await store.checkResume();
      alert(`已清理全部 ${count} 个会话`);
      await onRefresh();
    } catch (err) {
      alert(`清理失败: ${getErrorMessage(err, '未知错误')}`);
    } finally {
      if (prepared) store.finishDataMutation();
    }
  }, [onRefresh]);

  const handleExportAll = useCallback(async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const data = await desktopDataGateway.exportAll();
      const filePath = await save({
        title: '导出数据',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, data);
        alert('数据导出成功！');
        onRefresh?.();
      }
    } catch (err) {
      alert(`导出失败: ${getErrorMessage(err, '未知错误')}`);
    }
  }, [onRefresh]);

  const handleImportAll = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await open({
        title: '导入数据',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (filePath) {
        const data = await readTextFile(filePath);
        if (!window.confirm('导入会按 sessionId 新增或覆盖会话。确定继续吗？')) return;
        const store = useGameStore.getState();
        let prepared = false;
        try {
          await store.prepareForDataMutation();
          prepared = true;
          const result = await desktopDataGateway.importAll(data);
          store.newGame();
          await store.checkResume();
          alert(result);
          onRefresh?.();
        } finally {
          if (prepared) store.finishDataMutation();
        }
      }
    } catch (err) {
      alert(`导入失败: ${getErrorMessage(err, '未知错误')}`);
    }
  }, [onRefresh]);

  if (!desktopAvailable) {
    return (
      <div className="glass-panel !bg-dark-800/50 p-4">
        <p className="text-sm text-gray-400">
          Web 模式仅用于开发调试；数据库备份、恢复和全量导入导出只在 Tauri 桌面版提供。
        </p>
      </div>
    );
  }

  if (degradedMode) {
    return (
      <div className="glass-panel !bg-amber-950/30 border border-amber-400/20 p-4 space-y-2">
        <h3 className="text-sm font-medium text-amber-200">临时内存模式</h3>
        <p className="text-sm text-amber-100/80 leading-relaxed">
          当前会话只保存在内存中，关闭应用后会丢失。为避免把临时结果误认为已持久化，数据库信息、备份、恢复、全量导入导出和清理操作均已停用。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Database info */}
      <div className="glass-panel !bg-dark-800/50 p-4 space-y-2">
        <h3 className="text-sm font-medium text-gray-200 mb-2">数据库信息</h3>
        {dbInfo ? (
          <>
            <InfoRow label="路径" value={dbInfo.path} />
            <InfoRow label="大小" value={`${(dbInfo.size / 1024).toFixed(1)} KB`} />
            <InfoRow label="会话总数" value={String(dbInfo.sessionCount)} />
            <InfoRow label="活跃会话" value={String(dbInfo.activeCount)} />
          </>
        ) : <p className="text-gray-500 text-sm">暂时无法读取数据库信息</p>}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {dataActionsDisabled && (
          <p className="text-xs text-amber-300">
            正在生成内容、保存会话或执行其他数据操作，请稍候。
          </p>
        )}
        <button
          type="button"
          onClick={handleBackup}
          disabled={dataActionsDisabled}
          className="btn-secondary text-sm w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
        >
          备份数据库
        </button>
        {backups.length > 0 && (
          <div className="space-y-2 pt-1">
            <h4 className="text-sm font-medium text-gray-300">最近备份</h4>
            {backups.map((backup) => (
              <div
                key={backup.path}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-dark-800/40 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-200">{backup.filename}</p>
                  <p className="text-xs text-gray-500">
                    {backup.modified} · {(backup.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(backup)}
                  disabled={dataActionsDisabled}
                  className="btn-secondary px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  恢复
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteBackup(backup)}
                  disabled={dataActionsDisabled}
                  className="btn-danger px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={handleCleanup}
            disabled={dataActionsDisabled}
            className="btn-danger text-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            清理已结束会话
          </button>
          <p className="text-xs text-gray-500 leading-relaxed">
            此操作将永久删除所有已结束的会话及其传记数据，无法撤销。
          </p>
        </div>
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={handleCleanupAll}
            disabled={dataActionsDisabled}
            className="btn-danger text-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            清理全部会话
          </button>
          <p className="text-xs text-gray-500 leading-relaxed">
            此操作将永久删除所有会话数据，无法撤销。
          </p>
        </div>
      </div>

      {/* Export / Import all data */}
      <div className="space-y-3 pt-3 border-t border-gray-700/50">
        <h4 className="text-sm font-medium text-gray-300">全部数据</h4>
        <button
          type="button"
          onClick={handleExportAll}
          disabled={dataActionsDisabled}
          className="btn-secondary text-sm w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
        >
          导出全部数据（JSON）
        </button>
        <button
          type="button"
          onClick={handleImportAll}
          disabled={dataActionsDisabled}
          className="btn-primary text-sm w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
        >
          导入全部数据（JSON）
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200 font-mono text-xs">{value}</span>
    </div>
  );
}
