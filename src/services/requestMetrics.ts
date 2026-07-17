import type { LLMErrorCode } from './llm';

export interface RequestMetric {
  timestamp: string;
  provider: string;
  model: string;
  durationMs: number;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
  attempt: number;
  status: 'success' | 'failure';
  errorCode?: LLMErrorCode;
}

const METRICS_KEY = 'bio_request_metrics';
const MAX_METRICS = 100;

export function recordRequestMetric(metric: RequestMetric): void {
  try {
    const previous = getRequestMetrics(MAX_METRICS);
    localStorage.setItem(
      METRICS_KEY,
      JSON.stringify([...previous, metric].slice(-MAX_METRICS))
    );
  } catch {
    // Metrics are optional and must never affect a narrative request.
  }
}

export function getRequestMetrics(limit = 20): RequestMetric[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(METRICS_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return (value as RequestMetric[]).slice(-Math.max(0, limit));
  } catch {
    return [];
  }
}

export function clearRequestMetrics(): void {
  localStorage.removeItem(METRICS_KEY);
}
