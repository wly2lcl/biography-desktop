import { describe, it, expect, vi } from 'vitest';
import { escapeForSSE, parseSSE, unescapeSSE } from './sse';

describe('parseSSE', () => {
  it('joins multiple data fields and flushes the final EOF event', async () => {
    const response = new Response(
      'event: message\r\ndata: {"value":\r\ndata: 1}\r\n\r\ndata: tail'
    );
    const events = [];
    for await (const event of parseSSE(response)) events.push(event);
    expect(events).toEqual([
      { event: 'message', data: '{"value":\n1}' },
      { event: null, data: 'tail' },
    ]);
  });

  it('cancels the reader when the consumer stops before EOF', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'));
      },
      cancel,
    }));

    for await (const event of parseSSE(response)) {
      expect(event.data).toBe('first');
      break;
    }

    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('escapeForSSE', () => {
  it('should escape backslashes', () => {
    expect(escapeForSSE('hello\\world')).toBe('hello\\\\world');
  });

  it('should escape newlines', () => {
    expect(escapeForSSE('hello\nworld')).toBe('hello\\nworld');
  });

  it('should escape carriage returns', () => {
    expect(escapeForSSE('hello\rworld')).toBe('hello\\rworld');
  });
});

describe('unescapeSSE', () => {
  it('should unescape newlines', () => {
    expect(unescapeSSE('hello\\nworld')).toBe('hello\nworld');
  });

  it('should unescape carriage returns', () => {
    expect(unescapeSSE('hello\\rworld')).toBe('hello\rworld');
  });

  it('should unescape backslashes', () => {
    expect(unescapeSSE('hello\\\\world')).toBe('hello\\world');
  });

  it('should round-trip escape/unescape', () => {
    const original = 'hello\nworld\rtest';
    expect(unescapeSSE(escapeForSSE(original))).toBe(original);
  });
});
