import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface StreamedTextProps {
  text: string;
  isStreaming: boolean;
}

/**
 * Extract a JSON string value starting from position `startIdx` in `src`.
 * Handles escape sequences properly. Returns { value, endIdx } where
 * endIdx points to the closing quote position (-1 if not yet closed).
 */
function extractJsonString(src: string, startIdx: number): { value: string; endIdx: number } {
  let value = '';
  let i = startIdx;
  while (i < src.length) {
    if (src[i] === '\\' && i + 1 < src.length) {
      const next = src[i + 1];
      if (next === 'n') value += '\n';
      else if (next === 'r') value += '\r';
      else if (next === 't') value += '\t';
      else if (next === '"') value += '"';
      else if (next === '\\') value += '\\';
      else if (next === '/') value += '/';
      else value += next;
      i += 2;
    } else if (src[i] === '"') {
      return { value, endIdx: i };
    } else {
      value += src[i];
      i++;
    }
  }
  return { value, endIdx: -1 };
}

/**
 * Find the position of a JSON key in the source text.
 * Returns -1 if not found.
 */
function findJsonKey(src: string, key: string): number {
  const pattern = `"${key}"`;
  const idx = src.indexOf(pattern);
  if (idx === -1) return -1;
  let j = idx + pattern.length;
  while (j < src.length && (src[j] === ' ' || src[j] === '\n' || src[j] === '\r' || src[j] === '\t')) j++;
  if (j < src.length && src[j] === ':') {
    j++;
    while (j < src.length && (src[j] === ' ' || src[j] === '\n' || src[j] === '\r' || src[j] === '\t')) j++;
    if (j < src.length && src[j] === '"') {
      return j + 1;
    }
  }
  return -1;
}

/** Heuristic: returns true if the text likely contains markdown syntax. */
function looksLikeMarkdown(text: string): boolean {
  return /(?:^|\n)\s*#{1,6}\s|\*\*.*?\*\*|__.*?__|`[^`]+`|\[.+\]\(.+\)|^>|^[-*+]\s|^\d+\.\s|---|\|.*\|/.test(text);
}

/**
 * Extract narrative text from streamed LLM JSON output.
 *
 * Supports two modes:
 * 1. Narrative (game start/scenario): extracts prologue + description
 * 2. System proposals: extracts title + description + abilities for each proposal
 *
 * Concatenates extracted values for a continuous reading experience.
 */
function extractNarrativeFromStreamedJson(full: string): string {
  if (!full || typeof full !== 'string') return '';

  let s = full;
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
  s = s.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '');
  s = s.replace(/^```(?:json)?\s*/m, '');

  // Check if this is a system proposal JSON (array of objects with title/description/abilities)
  const hasSystemFields = findJsonKey(s, 'title') !== -1 && findJsonKey(s, 'abilities') !== -1;

  if (hasSystemFields) {
    // System proposal mode: extract all proposals incrementally
    const parts: string[] = [];

    // Find all "title" occurrences and extract their values
    let searchIdx = 0;
    while (true) {
      const remaining = s.slice(searchIdx);
      const titlePos = findJsonKey(remaining, 'title');
      if (titlePos === -1) break;

      const absTitlePos = searchIdx + titlePos;
      const { value: title } = extractJsonString(s, absTitlePos);

      // Find description after title
      const afterTitle = s.slice(absTitlePos);
      const descPosInRemaining = findJsonKey(afterTitle, 'description');
      let description = '';
      if (descPosInRemaining !== -1) {
        const absDescPos = absTitlePos + descPosInRemaining;
        const { value } = extractJsonString(s, absDescPos);
        description = value;
      }

      // Find abilities after description
      const descEndIdx = description ? s.indexOf(description, absTitlePos) + description.length : absTitlePos;
      const afterDesc = s.slice(descEndIdx);
      const abilPosInAfter = findJsonKey(afterDesc, 'abilities');
      let abilities = '';
      if (abilPosInAfter !== -1) {
        const absAbilPos = afterDesc.indexOf('"abilities"') + '"abilities"'.length;
        // Find the colon after abilities
        let j = absAbilPos;
        while (j < s.length && s[j] !== ':') j++;
        j++; // skip colon
        while (j < s.length && (s[j] === ' ' || s[j] === '\n')) j++;
        if (j < s.length && s[j] === '"') {
          const { value } = extractJsonString(s, j + 1);
          abilities = value;
        }
      }

      if (title) {
        let proposalText = `【${title}】\n`;
        if (description) proposalText += `${description}\n`;
        if (abilities) proposalText += `能力：${abilities}`;
        parts.push(proposalText.trim());
      }

      // Move past this title to find the next one
      searchIdx = absTitlePos + title.length + 10; // skip past the title value
    }

    if (parts.length) return parts.join('\n\n');
  }

  // Narrative mode: prologue + description
  const parts: string[] = [];

  const prologueStart = findJsonKey(s, 'prologue');
  if (prologueStart !== -1) {
    const { value } = extractJsonString(s, prologueStart);
    if (value.trim()) parts.push(value.trim());
  }

  const descStart = findJsonKey(s, 'description');
  if (descStart !== -1) {
    const { value } = extractJsonString(s, descStart);
    if (value && value.trim()) {
      const trimmed = value.trim();
      const lastPart = parts[parts.length - 1] || '';
      if (!parts.length || !lastPart.endsWith(trimmed.slice(0, Math.min(20, trimmed.length)))) {
        parts.push(trimmed);
      }
    }
  }

  if (!parts.length) {
    return s
      .replace(/^[\s\{\[",]*/, '')
      .replace(/[\}\]".,:]+\s*$/, '')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
  }

  return parts.join('\n\n');
}

export default function StreamedText({ text, isStreaming }: StreamedTextProps) {
  const safeText = typeof text === 'string' ? text : '';
  const displayText = isStreaming ? extractNarrativeFromStreamedJson(safeText) : safeText;

  const rendered = useMemo(() => {
    if (!displayText) return '';
    if (isStreaming || !looksLikeMarkdown(displayText)) return '';
    try {
      const raw = marked.parse(displayText, { async: false }) as string;
      return DOMPurify.sanitize(raw);
    } catch {
      return displayText;
    }
  }, [displayText, isStreaming]);

  if (!displayText) {
    if (isStreaming) {
      return (
        <div className="text-gray-500 text-sm italic animate-pulse">
          正在生成剧情...
        </div>
      );
    }
    return null;
  }

  if (isStreaming || !rendered) {
    return (
      <div
        className={`streamed-text text-gray-200 text-base leading-relaxed font-sans ${
          isStreaming ? 'typing-cursor' : ''
        }`}
      >
        {displayText}
      </div>
    );
  }

  return (
    <div
      className="prose-biography streamed-text text-gray-200 text-base leading-relaxed"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}
