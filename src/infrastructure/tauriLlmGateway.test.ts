import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class<T> {
    constructor(public readonly onmessage: (message: T) => void) {}
  },
}));

import { tauriLlmGateway } from './tauriLlmGateway';

const config = {
  provider: 'openai' as const,
  apiKey: '',
  baseUrl: '',
  model: 'gpt-4o-mini',
  temperature: 0,
  maxTokens: 16,
  contextWindow: 4096,
  timeout: 1000,
};

describe('tauriLlmGateway', () => {
  beforeEach(() => invokeMock.mockReset());
  afterEach(() => vi.unstubAllEnvs());

  it('streams tokens and keeps persisted secrets out of the request payload', async () => {
    invokeMock.mockImplementationOnce((_command, args) => {
      args.onEvent.onmessage({ type: 'token', requestId: args.request.requestId, content: 'OK' });
      args.onEvent.onmessage({ type: 'completed', requestId: args.request.requestId });
      return Promise.resolve();
    });
    const tokens: string[] = [];
    await expect(tauriLlmGateway.streamText(
      [{ role: 'user', content: 'test' }],
      config,
      (token) => tokens.push(token)
    )).resolves.toBe('OK');
    expect(tokens).toEqual(['OK']);
    expect(invokeMock.mock.calls[0][1].request).not.toHaveProperty('apiKey');
    expect(invokeMock.mock.calls[0][1].request.ephemeralApiKey).toBeUndefined();
  });

  it('sends a draft key only as an ephemeral connection-test value', async () => {
    invokeMock.mockImplementationOnce((_command, args) => {
      args.onEvent.onmessage({ type: 'token', requestId: args.request.requestId, content: 'OK' });
      args.onEvent.onmessage({ type: 'completed', requestId: args.request.requestId });
      return Promise.resolve();
    });
    await tauriLlmGateway.streamText(
      [{ role: 'user', content: 'test' }],
      { ...config, apiKey: 'draft-secret' }
    );
    expect(invokeMock.mock.calls[0][1].request.ephemeralApiKey).toBe('draft-secret');
  });

  it('rejects an already-cancelled request before invoking Rust', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(tauriLlmGateway.streamText(
      [{ role: 'user', content: 'test' }], config, undefined, controller.signal
    )).rejects.toMatchObject({ code: 'cancelled' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('rejects immediately when an active Rust request is cancelled and ignores late tokens', async () => {
    let streamArgs: any;
    invokeMock.mockImplementation((command, args) => {
      if (command === 'stream_llm') {
        streamArgs = args;
        return new Promise(() => undefined);
      }
      return Promise.resolve();
    });
    const controller = new AbortController();
    const onToken = vi.fn();
    const pending = tauriLlmGateway.streamText(
      [{ role: 'user', content: 'test' }], config, onToken, controller.signal
    );
    await vi.waitFor(() => expect(streamArgs).toBeDefined());

    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(invokeMock).toHaveBeenCalledWith('cancel_llm_request', {
      requestId: streamArgs.request.requestId,
    });
    streamArgs.onEvent.onmessage({
      type: 'token', requestId: streamArgs.request.requestId, content: 'late',
    });
    expect(onToken).not.toHaveBeenCalled();
  });

  it('preserves HTTP status and Retry-After from Rust errors', async () => {
    invokeMock.mockImplementationOnce((_command, args) => {
      args.onEvent.onmessage({
        type: 'error',
        requestId: args.request.requestId,
        code: 'rate_limit',
        message: 'slow down',
        status: 429,
        retryAfterMs: 2000,
      });
      return Promise.resolve();
    });
    await expect(tauriLlmGateway.streamText(
      [{ role: 'user', content: 'test' }], config
    )).rejects.toMatchObject({ code: 'rate_limit', status: 429, retryAfterMs: 2000 });
  });

  it('routes experimental custom providers through Rust with a draft key', async () => {
    vi.stubEnv('VITE_ENABLE_EXPERIMENTAL_PROVIDERS', 'true');
    invokeMock.mockImplementationOnce((_command, args) => {
      args.onEvent.onmessage({ type: 'token', requestId: args.request.requestId, content: 'OK' });
      args.onEvent.onmessage({ type: 'completed', requestId: args.request.requestId });
      return Promise.resolve();
    });

    await expect(tauriLlmGateway.streamText(
      [{ role: 'user', content: 'test' }],
      {
        ...config,
        provider: 'custom',
        baseUrl: 'https://gateway.example.com',
        apiKey: 'custom-draft-key',
      }
    )).resolves.toBe('OK');
    expect(invokeMock.mock.calls[0][1].request).toMatchObject({
      provider: 'custom',
      baseUrl: 'https://gateway.example.com',
      ephemeralApiKey: 'custom-draft-key',
    });
  });
});
