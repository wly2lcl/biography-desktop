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

      // Check if error is retryable
      const isRetryable = opts.retryableErrors.some((e) =>
        message.toLowerCase().includes(e.toLowerCase())
      );

      if (!isRetryable || attempt === opts.maxAttempts) {
        throw lastError;
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
