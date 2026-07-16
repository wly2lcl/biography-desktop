import { describe, it, expect, vi } from 'vitest';
import { LLMError } from './llm';
import { withRetry, apiCall } from './retry';

describe('withRetry', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('still performs one attempt when maxAttempts is zero', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    await expect(withRetry(fn, { maxAttempts: 0 })).resolves.toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure then succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValue('success');
    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50, jitterMs: 0 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('INVALID_API_KEY'));
    await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50, jitterMs: 0 })).rejects.toThrow('INVALID_API_KEY');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(withRetry(fn, { maxAttempts: 2, initialDelayMs: 10, maxDelayMs: 50, jitterMs: 0 })).rejects.toThrow('ETIMEDOUT');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should detect HTTP 5xx as retryable', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50, jitterMs: 0 });
    expect(result).toBe('ok');
  });

  it('should NOT retry HTTP 4xx (except 429)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 401'));
    await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50, jitterMs: 0 })).rejects.toThrow('HTTP 401');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-progress retry backoff immediately', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new LLMError('server', 'unavailable', 503));
    const pending = withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 60_000,
      jitterMs: 0,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('apiCall', () => {
  it('should return parsed JSON on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    });
    const result = await apiCall('/api/test');
    expect(result).toEqual({ data: 'test' });
  });

  it('should NOT retry 4xx errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    });
    await expect(apiCall('/api/test', 'GET', null, 2)).rejects.toThrow('HTTP 401');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
