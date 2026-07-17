export interface ContextBudget {
  contextWindowTokens: number;
  reservedOutputTokens: number;
  safetyMarginTokens: number;
}

export interface ContextBudgetResult {
  text: string;
  estimatedInputTokens: number;
  availableInputTokens: number;
  truncated: boolean;
}

/**
 * Conservative tokenizer-independent estimate. CJK characters are usually
 * denser than Latin text, so they receive a larger token weight.
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const character of text) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return Math.max(1, Math.ceil(cjk / 1.5 + other / 4));
}

export function availableInputTokens(budget: ContextBudget): number {
  return Math.max(
    0,
    Math.floor(
      budget.contextWindowTokens
      - budget.reservedOutputTokens
      - budget.safetyMarginTokens
    )
  );
}

export function fitPromptToContext(
  text: string,
  budget: ContextBudget
): ContextBudgetResult {
  const available = availableInputTokens(budget);
  const estimated = estimateTokens(text);
  // A tiny positive remainder is still unusable once the surrounding prompt
  // envelope and model-specific tokenization variance are considered.
  if (available < 256) {
    return {
      text: '',
      estimatedInputTokens: estimated,
      availableInputTokens: available,
      truncated: true,
    };
  }
  if (estimated <= available) {
    return {
      text,
      estimatedInputTokens: estimated,
      availableInputTokens: available,
      truncated: false,
    };
  }
  const marker = '\n\n【上下文预算已省略较早的非关键内容】\n\n';
  let targetCharacters = Math.max(
    256,
    Math.floor(text.length * (available / estimated) * 0.9) - marker.length
  );
  let fitted = text;
  while (targetCharacters >= 256) {
    const headLength = Math.floor(targetCharacters * 0.3);
    const tailLength = targetCharacters - headLength;
    fitted = `${text.slice(0, headLength)}${marker}${text.slice(-tailLength)}`;
    if (estimateTokens(fitted) <= available) break;
    targetCharacters = Math.floor(targetCharacters * 0.85);
  }

  return {
    text: fitted,
    estimatedInputTokens: estimateTokens(fitted),
    availableInputTokens: available,
    truncated: true,
  };
}
