import { useGameStore } from '@/store/gameStore';
import type { SystemProposal } from '@/types/models';

/**
 * Incrementally parse streamed JSON text into partial SystemProposal objects.
 *
 * Uses brace-counting to find proposal boundaries, then extracts
 * title/description/abilities within each object.
 */
function parseStreamedProposals(
  text: string
): (SystemProposal & { partial: boolean })[] {
  if (!text) return [];

  let s = text;
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
  s = s.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '');
  s = s.replace(/^```(?:json)?\s*/m, '');

  // Find all top-level JSON objects by brace counting
  const objects: { text: string; partial: boolean }[] = [];
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let objStart = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === '{') {
        if (depth === 0) objStart = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && objStart !== -1) {
          objects.push({ text: s.slice(objStart, i + 1), partial: false });
          objStart = -1;
        }
      }
    }
  }

  // If we're inside an object that hasn't closed yet
  if (depth > 0 && objStart !== -1) {
    objects.push({ text: s.slice(objStart), partial: true });
  }

  // Parse each object into a proposal
  const cardOrder = ['a', 'b', 'c'];
  const proposals: (SystemProposal & { partial: boolean })[] = [];

  for (let idx = 0; idx < objects.length && idx < 3; idx++) {
    const obj = objects[idx];
    const proposal = parseProposalObject(obj.text, cardOrder[idx] || String(idx));
    if (proposal.title || proposal.description || proposal.abilities) {
      proposals.push({
        ...proposal,
        partial: obj.partial || !proposal.title || !proposal.abilities,
      });
    }
  }

  return proposals;
}

/**
 * Parse a single JSON object string into a SystemProposal.
 * Handles incomplete/partial objects gracefully.
 */
function parseProposalObject(
  objText: string,
  id: string
): SystemProposal & { partial: boolean } {
  const result: SystemProposal & { partial: boolean } = {
    id,
    title: '',
    description: '',
    abilities: '',
    partial: false,
  };

  // Extract "title" value
  const titleResult = extractStringField(objText, 'title');
  if (titleResult) {
    result.title = titleResult.value;
    result.partial = result.partial || !titleResult.complete;
  }

  // Extract "description" value
  const descResult = extractStringField(objText, 'description');
  if (descResult) {
    result.description = descResult.value;
    result.partial = result.partial || !descResult.complete;
  }

  // Extract "abilities" value
  const abilResult = extractStringField(objText, 'abilities');
  if (abilResult) {
    result.abilities = abilResult.value;
    result.partial = result.partial || !abilResult.complete;
  }

  return result;
}

/**
 * Extract a string field value from a JSON object text.
 * Returns { value, complete } where complete=false means the value
 * is still being streamed (no closing quote found).
 */
function extractStringField(
  objText: string,
  key: string
): { value: string; complete: boolean } | null {
  // Find the key followed by a colon
  const keyPattern = `"${key}"`;
  let searchStart = 0;

  while (true) {
    const keyIdx = objText.indexOf(keyPattern, searchStart);
    if (keyIdx === -1) return null;

    // Verify it's followed by whitespace/colon (not a substring of a larger key)
    let j = keyIdx + keyPattern.length;
    while (j < objText.length && (objText[j] === ' ' || objText[j] === '\n' || objText[j] === '\r' || objText[j] === '\t')) j++;
    if (j >= objText.length) return null;
    if (objText[j] !== ':') {
      searchStart = keyIdx + 1;
      continue;
    }

    // Skip colon and whitespace to find the opening quote
    j++;
    while (j < objText.length && (objText[j] === ' ' || objText[j] === '\n' || objText[j] === '\r' || objText[j] === '\t')) j++;
    if (j >= objText.length || objText[j] !== '"') {
      searchStart = keyIdx + 1;
      continue;
    }

    // Extract string value after opening quote
    const { value, complete } = extractJsonValue(objText, j + 1);
    return { value, complete };
  }
}

/**
 * Extract a JSON string value starting at `startIdx` (after the opening quote).
 */
function extractJsonValue(
  src: string,
  startIdx: number
): { value: string; complete: boolean } {
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
      return { value, complete: true };
    } else {
      value += src[i];
      i++;
    }
  }

  // Reached end of source without closing quote - still streaming
  return { value, complete: false };
}

export default function SystemScreen() {
  const {
    systemProposals,
    selectedSystem,
    isStreaming,
    streamedText,
    selectSystem,
    startSystemGame,
    setScreen,
  } = useGameStore();

  // During streaming, parse partial proposals; when done, use final proposals
  const displayCards = isStreaming
    ? parseStreamedProposals(streamedText)
    : systemProposals;

  const handleConfirm = () => {
    if (!selectedSystem || isStreaming) return;
    startSystemGame();
  };

  return (
    <div className="w-full h-full flex flex-col items-center bg-dark-950 overflow-y-auto p-6">
      <div className="w-full max-w-4xl animate-fade-in flex flex-col min-h-0">
        {/* ── Title ─────────────────────────────────── */}
        <div className="text-center mb-8 shrink-0">
          <h1 className="text-2xl font-serif text-primary-300 mb-2 tracking-wide">
            选择你的系统
          </h1>
          <p className="text-gray-400 text-sm">
            选择一个系统方案来塑造你的角色能力与故事走向
          </p>
        </div>

        {/* ── Streaming cards / Final cards ─────────── */}
        {displayCards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 flex-1">
            {/* Pad to 3 cards during streaming */}
            {(isStreaming
              ? [...displayCards, ...Array(3 - displayCards.length).fill(null)]
              : displayCards
            ).map((proposal, idx) => {
              if (!proposal) {
                return (
                  <div
                    key={`ph-${idx}`}
                    className="card-base flex items-center justify-center min-h-[200px]"
                  >
                    <div className="text-center">
                      <div className="w-4 h-4 rounded-full border-2 border-gray-600 border-t-primary-500 animate-spin mx-auto mb-2" />
                      <p className="text-gray-600 text-xs">生成中...</p>
                    </div>
                  </div>
                );
              }

              const isSelected = selectedSystem?.id === proposal.id;
              return (
                <button
                  key={proposal.id || idx}
                  type="button"
                  onClick={() => !proposal.partial && selectSystem(proposal as SystemProposal)}
                  className={`card-base text-left transition-all duration-200 flex flex-col ${
                    proposal.partial
                      ? 'opacity-70 pointer-events-none'
                      : isSelected
                      ? 'border-primary-400 bg-primary-400/10 ring-1 ring-primary-400/30 cursor-pointer'
                      : 'hover:border-primary-400/50 cursor-pointer'
                  }`}
                >
                  <h3
                    className={`text-lg font-serif font-medium mb-2 ${
                      isSelected ? 'text-primary-300' : 'text-gray-100'
                    }`}
                  >
                    {proposal.title || '生成中...'}
                  </h3>
                  {proposal.description && (
                    <p className="text-gray-400 text-sm mb-3 leading-relaxed flex-1">
                      {proposal.description}
                    </p>
                  )}
                  {proposal.abilities && (
                    <div className="bg-dark-800/50 rounded-lg p-3 mt-auto">
                      <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wider">
                        能力
                      </p>
                      <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                        {proposal.abilities}
                      </p>
                    </div>
                  )}
                  {proposal.partial && (
                    <div className="mt-3 flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full border-2 border-dark-600 border-t-primary-500 animate-spin" />
                      <span className="text-xs text-gray-600">生成中...</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : isStreaming ? (
          /* Nothing parsed yet */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 flex-1">
            {[0, 1, 2].map((i) => (
              <div
                key={`ph-init-${i}`}
                className="card-base flex items-center justify-center min-h-[200px]"
              >
                <div className="text-center">
                  <div className="w-4 h-4 rounded-full border-2 border-gray-600 border-t-primary-500 animate-spin mx-auto mb-2" />
                  <p className="text-gray-600 text-xs">生成中...</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-panel p-8 text-center mb-8 shrink-0">
            <p className="text-gray-500">
              暂无系统方案，请返回并选择「系统模式」开始
            </p>
          </div>
        )}

        {/* ── Action buttons ────────────────────────── */}
        <div className="flex justify-center gap-3 shrink-0 pb-4">
          <button
            type="button"
            onClick={() => setScreen('start')}
            className="btn-secondary"
            disabled={isStreaming}
          >
            返回
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedSystem || isStreaming}
            className="btn-primary min-w-[100px]"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
