// src/services/retry.ts - Retry with exponential backoff

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  jitterMs: 2000,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'Rate limit', 'network', 'fetch'],
};

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
  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const message = error instanceof Error ? error.message : String(error);

      // Check HTTP status code first (e.g. "HTTP 429", "HTTP 500")
      const httpMatch = message.match(/HTTP\s+(\d{3})/);
      let isHttpRetryable = false;
      if (httpMatch) {
        const statusCode = parseInt(httpMatch[1], 10);
        if (statusCode === 429) {
          // Rate limit: retryable with longer backoff
          const delay = Math.min(
            opts.initialDelayMs * Math.pow(3, attempt - 1),
            opts.maxDelayMs
          ) + Math.random() * opts.jitterMs;
          console.warn(
            `LLM retry attempt ${attempt}/${opts.maxAttempts} after ${Math.round(delay)}ms (HTTP ${statusCode}): ${message}`
          );
          await new Promise((r) => setTimeout(r, delay));
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
      await new Promise((r) => setTimeout(r, delay));
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
