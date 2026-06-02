// src/utils/sse.ts - SSE parsing utilities

export interface SSEEvent {
  event: string | null;
  data: string;
}

/**
 * Parse SSE stream into events
 * Handles standard SSE format: event: / data: / :comments
 */
export async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastEvent: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        lastEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        yield { event: lastEvent, data: line.slice(6) };
      } else if (line.startsWith(':')) {
        // Comment line, ignore
      } else if (line === '') {
        // Empty line marks end of event
        lastEvent = null;
      }
    }
  }
}

/**
 * Escape text for SSE data field
 */
export function escapeForSSE(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Unescape SSE data field
 */
export function unescapeSSE(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}
