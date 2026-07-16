// src/services/runtime.ts - Shared browser/Tauri runtime detection

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

/**
 * Tauri 2 exposes __TAURI_INTERNALS__ by default. __TAURI__ only exists when
 * app.withGlobalTauri is explicitly enabled, so it is a compatibility fallback.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const tauriWindow = window as TauriWindow;
  return Boolean(tauriWindow.__TAURI_INTERNALS__ || tauriWindow.__TAURI__);
}
