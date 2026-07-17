import type { DesktopDataGateway } from './contracts';

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(name, args);
}

export const desktopDataGateway: DesktopDataGateway = {
  getInfo: () => command('get_database_info'),
  listBackups: () => command('list_backups'),
  backup: () => command('backup_database'),
  restore: (backupPath) => command('restore_database', { backupPath }),
  deleteBackup: (backupPath) => command('delete_backup', { backupPath }),
  clearEndedSessions: () => command('clear_ended_sessions'),
  clearAllSessions: () => command('clear_all_sessions'),
  exportAll: () => command('export_full_data'),
  importAll: (data) => command('import_full_data', { data }),
};
