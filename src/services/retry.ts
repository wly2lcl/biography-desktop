// src/services/retry.ts - Retry with exponential backoff

import { LLMError } from './llm';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
  retryableErrors: string[];
  signal?: AbortSignal;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  jitterMs: 2000,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'Rate limit', 'network', 'fetch'],
};

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new LLMError('cancelled', 'LLM request cancelled'));
  }
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(new LLMError('cancelled', 'LLM request cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Determine if an HTTP status code is retryable.
 * - 4xx client errors are generally NOT retryable (except 429).
 * - 5xx server errors are retryable.
 */
export function isRetryableHttpError(statusCode: number): boolean {
  if (statusCode >= 500) return true;
  if (statusCode === 429) return true; // Rate limit — retryable with longer delay
  return false; // 400-418, 401, 403, 404, etc. — not retryable
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  opts.maxAttempts = Number.isFinite(opts.maxAttempts)
    ? Math.max(1, Math.floor(opts.maxAttempts))
    : DEFAULT_RETRY_OPTIONS.maxAttempts;
  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new LLMError('cancelled', 'LLM request cancelled');
    }
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof LLMError) {
        const retryable = error.code === 'rate_limit'
          || error.code === 'timeout'
          || error.code === 'network'
          || error.code === 'server';
        if (!retryable || attempt === opts.maxAttempts) throw error;
        const delay = error.retryAfterMs ?? Math.min(
          opts.initialDelayMs * Math.pow(2, attempt - 1),
          opts.maxDelayMs
        ) + Math.random() * opts.jitterMs;
        await waitForRetry(delay, opts.signal);
        continue;
      }

      // Check HTTP status code first (e.g. "HTTP 429", "HTTP 500")
      const httpMatch = message.match(/HTTP\s+(\d{3})/);
      let isHttpRetryable = false;
      if (httpMatch) {
        const statusCode = parseInt(httpMatch[1], 10);
        if (statusCode === 429) {
          if (attempt === opts.maxAttempts) throw lastError;
          // Rate limit: retryable with longer backoff
          const delay = Math.min(
            opts.initialDelayMs * Math.pow(3, attempt - 1),
            opts.maxDelayMs
          ) + Math.random() * opts.jitterMs;
          console.warn(
            `LLM retry attempt ${attempt}/${opts.maxAttempts} after ${Math.round(delay)}ms (HTTP ${statusCode}): ${message}`
          );
          await waitForRetry(delay, opts.signal);
          continue;
        }
        if (!isRetryableHttpError(statusCode)) {
          // Non-retryable HTTP error (4xx except 429)
          throw lastError;
        }
        // 5xx: retryable — skip message-based fallback
        isHttpRetryable = true;
      }

      // Fallback: check error message strings (skip if HTTP status already handled)
      if (!isHttpRetryable) {
        const isRetryable = opts.retryableErrors.some((e) =>
          message.toLowerCase().includes(e.toLowerCase())
        );

        if (!isRetryable || attempt === opts.maxAttempts) {
          throw lastError;
        }
      }

      // Exponential backoff + jitter
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(2, attempt - 1),
        opts.maxDelayMs
      ) + Math.random() * opts.jitterMs;

      console.warn(
        `LLM retry attempt ${attempt}/${opts.maxAttempts} after ${Math.round(delay)}ms: ${message}`
      );
      await waitForRetry(delay, opts.signal);
    }
  }

  throw lastError!;
}

/**
 * Frontend API call with retry logic
 * 4xx errors are not retried
 */
export async function apiCall<T>(
  endpoint: string,
  method: string = 'GET',
  data: unknown = null,
  retries: number = 2
): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) options.body = JSON.stringify(data);

  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, options);
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          detail = errorData.detail || detail;
        } catch {
          // Ignore
        }
        throw new Error(detail);
      }
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      const message = error instanceof Error ? error.message : '';

      // 4xx client errors should not be retried
      if (/40[0-4]|422/.test(message)) {
        throw error;
      }

      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError!;
}
