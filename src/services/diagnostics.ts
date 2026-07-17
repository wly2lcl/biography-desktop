import type { AppSettings } from '../types/settings';
import { errorLogger } from './errorLogger';
import { getRequestMetrics } from './requestMetrics';

export function buildDiagnosticBundle(settings: AppSettings): string {
  return JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    appVersion: import.meta.env.VITE_APP_VERSION || '0.1.0',
    runtime: {
      platform: navigator.platform,
      language: navigator.language,
      userAgent: navigator.userAgent,
    },
    configuration: {
      provider: settings.llmProvider,
      baseUrlConfigured: settings.baseUrl.trim().length > 0,
      model: settings.model,
      maxTokens: settings.maxTokens,
      contextWindow: settings.contextWindow,
      timeout: settings.timeout,
    },
    requestMetrics: getRequestMetrics(50),
    errorLogs: JSON.parse(errorLogger.exportLogs()),
    privacy: 'API keys, prompts, questions, player names and story history are excluded or redacted.',
  }, null, 2);
}

export function downloadDiagnosticBundle(settings: AppSettings): void {
  const blob = new Blob([buildDiagnosticBundle(settings)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `biography-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
