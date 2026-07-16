// src/utils/sse.ts - Incremental SSE parser

export interface SSEEvent {
  event: string | null;
  data: string;
}

/** Parse SSE without assuming network chunk boundaries. */
export async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> {
  if (!response.body) throw new Error('SSE response body is empty');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName: string | null = null;
  let dataLines: string[] = [];

  const parseLine = (rawLine: string): SSEEvent | null => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      if (dataLines.length === 0) {
        eventName = null;
        return null;
      }
      const event = { event: eventName, data: dataLines.join('\n') };
      eventName = null;
      dataLines = [];
      return event;
    }
    if (line.startsWith(':')) return null;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim() || null;
      return null;
    }
    if (line.startsWith('data:')) {
      const rawData = line.slice(5);
      const data = rawData.startsWith(' ') ? rawData.slice(1) : rawData;
      dataLines.push(data);
    }
    return null;
  };

  let reachedEof = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        reachedEof = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const event = parseLine(line);
        if (event) yield event;
      }
    }

    buffer += decoder.decode();
    if (buffer) {
      const event = parseLine(buffer);
      if (event) yield event;
    }
    if (dataLines.length > 0) {
      yield { event: eventName, data: dataLines.join('\n') };
    }
  } finally {
    if (!reachedEof) {
      try {
        await reader.cancel();
      } catch {
        // Stream cleanup must not replace a successful completed response.
      }
    }
    reader.releaseLock();
  }
}

export function escapeForSSE(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

export function unescapeSSE(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
}
