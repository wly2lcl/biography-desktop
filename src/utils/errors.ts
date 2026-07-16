/** Preserve useful diagnostics from browser APIs, Tauri IPC, and ordinary Errors. */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}
