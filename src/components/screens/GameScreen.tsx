import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import StreamedText from '@/components/common/StreamedText';
import QAPanel from '@/components/qa/QAPanel';
import { formatTimestamp } from '@/utils/format';
import type { Choice, HistoryEntry } from '@/types/models';

export default function GameScreen() {
  const {
    session,
    currentScenario,
    isStreaming,
    streamedText,
    makeChoice,
    setShowConfirmEnd,
    setShowSettings,
    setShowWorldManager,
    askQuestion,
    generateBiography,
  } = useGameStore();

  const [showHistory, setShowHistory] = useState(false);
  const [showQA, setShowQA] = useState(false);

  // ── Guard: nothing to render ──────────────────────────
  if (!session || !currentScenario) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-dark-950">
        <div className="text-center animate-fade-in">
          <div className="w-8 h-8 border-2 border-primary-500/40 border-t-primary-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  const isInactive = !session.isActive;
  const chapterCount = session.player.history.length + 1;

  // ── Choice handler ────────────────────────────────────
  const handleChoice = (choiceId: string) => {
    if (isStreaming) return;
    makeChoice(choiceId);
  };

  // ── Check whether any choice has id === 'end' ────────
  const endChoice = currentScenario.choices.find((c) => c.id === 'end');
  const regularChoices = currentScenario.choices.filter((c) => c.id !== 'end');

  return (
    <div className="w-full h-full bg-dark-950 flex flex-col">
      {/* ══════════════════════════════════════════════════
          HEADER
          ══════════════════════════════════════════════════ */}
      <header className="shrink-0 glass-panel mx-3 mt-3 px-4 py-3 flex items-center justify-between gap-4 animate-fade-in">
        {/* Session info */}
        <div className="flex items-center gap-3 text-sm min-w-0">
          <span className="text-primary-300 font-medium truncate">
            {session.world}
          </span>
          <span className="text-gray-600 hidden sm:inline">|</span>
          <span className="text-gray-100 truncate hidden sm:inline">
            {session.player.name}
          </span>
          <span className="text-gray-500 shrink-0">
            · 第 {chapterCount} 章
          </span>
          {session.createdAt && (
            <span className="text-gray-600 text-xs hidden lg:inline">
              · {formatTimestamp(session.createdAt)}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowWorldManager(true)}
            className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
            title="管理世界"
          >
            🌍
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
            title="设置"
          >
            ⚙️
          </button>
          <button
            onClick={() => setShowQA((v) => !v)}
            className={`btn-secondary text-xs sm:text-sm py-1.5 px-2.5 sm:px-3 transition-all ${
              showQA ? 'ring-1 ring-primary-400/40' : ''
            }`}
          >
            {showQA ? '关闭问答' : '问答'}
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`btn-secondary text-xs sm:text-sm py-1.5 px-2.5 sm:px-3 transition-all ${
              showHistory ? 'ring-1 ring-primary-400/40' : ''
            }`}
          >
            {showHistory ? '关闭记录' : '旅程记录'}
          </button>
          {isInactive ? (
            <button
              onClick={generateBiography}
              disabled={isStreaming}
              className="btn-primary text-xs sm:text-sm py-1.5 px-3"
            >
              生成传记
            </button>
          ) : (
            <button
              onClick={() => setShowConfirmEnd(true)}
              disabled={isStreaming}
              className="btn-danger text-xs sm:text-sm py-1.5 px-3"
            >
              结束旅程
            </button>
          )}
        </div>
      </header>

      {/* ══════════════════════════════════════════════════
          MAIN CONTENT
          ══════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* ── Left column: scenario + QA ───────────────── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Scenario card */}
          <div className="glass-panel p-5 sm:p-6 overflow-y-auto animate-fade-in flex-1">
            {/* Title */}
            {currentScenario.title && (
              <h2 className="text-xl sm:text-2xl font-serif text-primary-200 mb-4 leading-snug">
                {currentScenario.title}
              </h2>
            )}

            {/* Description / Streamed text */}
            {isStreaming ? (
              <StreamedText text={streamedText} isStreaming />
            ) : (
              <div className="text-gray-200 text-base leading-relaxed whitespace-pre-wrap">
                {currentScenario.description}
              </div>
            )}

            {/* ── Choices ──────────────────────────────── */}
            {!isInactive && !isStreaming && currentScenario.choices.length > 0 && (
              <div className="mt-6 space-y-2.5">
                {regularChoices.map((choice) => (
                  <ChoiceButton
                    key={choice.id}
                    choice={choice}
                    onClick={() => handleChoice(choice.id)}
                    disabled={isStreaming}
                  />
                ))}
                {endChoice && (
                  <ChoiceButton
                    choice={endChoice}
                    onClick={() => handleChoice(endChoice.id)}
                    disabled={isStreaming}
                    variant="danger"
                  />
                )}
              </div>
            )}

            {/* Disabled choices during streaming (show dimmed) */}
            {isStreaming && currentScenario.choices.length > 0 && (
              <div className="mt-6 space-y-2.5 opacity-40 pointer-events-none">
                {currentScenario.choices.map((choice) => (
                  <ChoiceButton
                    key={choice.id}
                    choice={choice}
                    onClick={() => {}}
                    disabled
                  />
                ))}
              </div>
            )}

            {/* ── Inactive-game prompt ─────────────────── */}
            {isInactive && (
              <div className="mt-8 p-5 bg-primary-500/10 border border-primary-500/30 rounded-xl text-center animate-slide-up">
                <p className="text-primary-200 text-base font-medium mb-1">
                  {session.endReason === 'player_ended' ? '旅程已主动结束' : '旅程已结束'}
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  {session.endReason === 'player_ended'
                    ? '你选择了在此处停下脚步。可以生成传记记录这段旅程，或稍后再说。'
                    : '你的冒险故事已经画上句号，现在可以生成一部专属传记来记录这段传奇。'}
                </p>
                {!session.biography ? (
                  <button
                    onClick={generateBiography}
                    className="btn-primary"
                  >
                    生成传记
                  </button>
                ) : (
                  <button
                    onClick={() => useGameStore.getState().setScreen('biography')}
                    className="btn-primary"
                  >
                    查看传记
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Q&A Panel ──────────────────────────────── */}
          {showQA && (
            <QAPanel
              session={session}
              onAsk={askQuestion}
            />
          )}
        </div>

        {/* ── Right sidebar: history ──────────────────── */}
        {showHistory && (
          <aside className="w-80 shrink-0 glass-panel flex flex-col animate-slide-up max-h-full">
            <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">旅程记录</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-500 hover:text-gray-300 transition-colors p-0.5"
                aria-label="关闭旅程记录"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {session.player.history.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8 select-none">
                  暂无记录
                </p>
              ) : (
                session.player.history.map((entry, i) => (
                  <HistoryCard key={i} entry={entry} index={i} />
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════ */

/** A single choice button — regular or danger variant for 'end'. */
function ChoiceButton({
  choice,
  onClick,
  disabled,
  variant = 'default',
}: {
  choice: Choice;
  onClick: () => void;
  disabled: boolean;
  variant?: 'default' | 'danger';
}) {
  const classes =
    variant === 'danger'
      ? 'w-full text-left btn-danger py-3 px-4 text-sm'
      : 'w-full text-left btn-secondary py-3 px-4 text-sm';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${classes} animate-slide-up transition-all duration-150`}
    >
      <span className="block">
        {variant === 'danger' ? '结束旅程' : choice.text}
      </span>
      {choice.description && (
        <span
          className={`block text-xs mt-0.5 ${
            variant === 'danger' ? 'text-red-300/80' : 'text-gray-500'
          }`}
        >
          {choice.description}
        </span>
      )}
    </button>
  );
}

/** A single history entry card for the sidebar. */
function HistoryCard({ entry, index }: { entry: HistoryEntry; index: number }) {
  return (
    <div className="card-base !p-3 animate-slide-up">
      <div className="flex items-start gap-2">
        <span className="text-gray-600 text-xs font-mono mt-0.5 shrink-0 w-4 text-right">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-gray-100 text-sm font-medium truncate">
            {entry.scenario}
          </p>
          <p className="text-gray-500 text-xs mt-1 line-clamp-2 leading-relaxed">
            {entry.choice}
          </p>
        </div>
      </div>
    </div>
  );
}
