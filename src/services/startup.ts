import { isTauriRuntime } from './runtime';

export interface StartupStatus {
  ready: boolean;
  degraded: boolean;
  dataDir: string;
  error: string | null;
}

export async function getStartupStatus(): Promise<StartupStatus> {
  if (!isTauriRuntime()) {
    return { ready: true, degraded: false, dataDir: '', error: null };
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<StartupStatus>('get_startup_status');
}

export async function openDataFolder(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_data_folder');
}
