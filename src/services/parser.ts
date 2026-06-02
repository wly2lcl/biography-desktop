// src/services/parser.ts - LLM JSON parser with fault tolerance

/**
 * Parse LLM response as JSON with multiple fallback strategies
 * Handles thinking tags, markdown fences, and partial JSON
 */
export function parseLLMJSON(raw: string): unknown {
  // 1. Clean thinking/reasoning tags
  let cleaned = raw
    .replace(/<thinking>.*?<\/thinking>/gs, '')
    .replace(/<reasoning>.*?<\/reasoning>/gs, '')
    .replace(/<answer>.*?<\/answer>/gs, '')
    // 2. Clean markdown code fences
    .replace(/```(?:json)?\s*/g, '')
    .replace(/\s*```/g, '')
    .trim();

  // 3. Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to fallback strategies
  }

  // 4. Try to find JSON array
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // Continue
    }
  }

  // 5. Try to find JSON object (balanced braces)
  const objectMatch = extractBalancedJSON(cleaned);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch);
    } catch {
      // Continue
    }
  }

  throw new Error('Failed to parse LLM response as valid JSON');
}

/**
 * Extract balanced JSON object from text
 */
function extractBalancedJSON(text: string): string | null {
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') depth++;
      if (char === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(startIdx, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * Clean LLM output by removing thinking tags, markdown fences, etc.
 */
export function cleanLLMOutput(text: string): string {
  return text
    .replace(/<thinking>.*?<\/thinking>/gs, '')
    .replace(/<reasoning>.*?<\/reasoning>/gs, '')
    .replace(/<answer>.*?<\/answer>/gs, '')
    .replace(/```(?:json)?\s*/g, '')
    .replace(/\s*```/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
