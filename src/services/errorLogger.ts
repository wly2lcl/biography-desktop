// src/services/errorLogger.ts - Lightweight error logging system

export interface ErrorLog {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

const MAX_LOG_SIZE = 1000; // max entries
const LOG_KEY = 'bio_error_logs';
const SAFE_DIAGNOSTIC_MESSAGES = new Set([
  'startBasicGame failed',
  'makeChoice failed',
  'generateBiography failed',
  'endGame persistence failed',
  'resumeGame failed',
  'askQuestion failed',
  'Unhandled error',
  'Unhandled promise rejection',
]);

export const errorLogger = {
  log(level: ErrorLog['level'], message: string, context?: Record<string, unknown>, error?: Error): void {
    const entry: ErrorLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      stack: error?.stack,
      context,
    };

    try {
      const logs: ErrorLog[] = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      logs.push(entry);
      // Keep only last MAX_LOG_SIZE entries
      if (logs.length > MAX_LOG_SIZE) {
        logs.splice(0, logs.length - MAX_LOG_SIZE);
      }
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    } catch {
      // localStorage full or unavailable
      console.error('[ErrorLogger] Failed to store log:', entry);
    }
  },

  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log('error', message, context, error);
  },

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  },

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  },

  getLogs(limit = 50): ErrorLog[] {
    try {
      const logs: ErrorLog[] = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      return logs.slice(-limit).reverse();
    } catch {
      return [];
    }
  },

  clearLogs(): void {
    localStorage.removeItem(LOG_KEY);
  },

  exportLogs(): string {
    const logs = this.getLogs(1000).map((entry) => ({
      timestamp: entry.timestamp,
      level: entry.level,
      message: SAFE_DIAGNOSTIC_MESSAGES.has(entry.message) ? entry.message : '[REDACTED]',
      context: sanitizeDiagnosticValue(entry.context) as Record<string, unknown> | undefined,
    }));
    return JSON.stringify(logs, null, 2);
  },
};

const SENSITIVE_DIAGNOSTIC_KEYS = /api.?key|authorization|secret|password|token|question|content|history|prompt|player.?name|reason/i;

export function sanitizeDiagnosticValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_DIAGNOSTIC_KEYS.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDiagnosticValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([childKey, childValue]) => [
          childKey,
          sanitizeDiagnosticValue(childValue, childKey),
        ])
    );
  }
  return value;
}

// Auto-capture unhandled errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    errorLogger.error('Unhandled error', { type: e.type }, e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    errorLogger.error('Unhandled promise rejection', { reason: String(e.reason) });
  });
}
