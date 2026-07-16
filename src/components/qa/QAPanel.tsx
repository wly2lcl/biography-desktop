import { useState, useRef, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useGameStore } from '@/store/gameStore';
import type { GameSession, QAMessage } from '@/types/models';

interface QAPanelProps {
  session: GameSession;
  onAsk: (question: string) => Promise<void>;
}

/**
 * Collapsible Q&A panel with message bubbles and streaming support.
 */
export default function QAPanel({ session, onAsk }: QAPanelProps) {
  const streamedText = useGameStore((s) => s.streamedText);
  const isQaStreaming = useGameStore((s) => s.isQaStreaming);
  const settings = useGameStore((s) => s.settings);

  const [expanded, setExpanded] = useState(true);
  const [question, setQuestion] = useState('');
  // Use ref instead of state for isAsking to avoid React batching race conditions
  const isAskingRef = useRef(false);
  const [, forceUpdate] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const qaHistory: QAMessage[] = session.player.qaHistory ?? [];
  const maxEntries = Math.min(settings?.maxQaHistory ?? 20, 20);
  const visibleMessages = qaHistory.slice(-maxEntries);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length, streamedText, isQaStreaming]);

  const handleSubmit = () => {
    const q = question.trim();
    if (!q || isQaStreaming || isAskingRef.current) return;

    setQuestion('');
    isAskingRef.current = true;
    forceUpdate((n) => n + 1);

    onAsk(q).finally(() => {
      isAskingRef.current = false;
      forceUpdate((n) => n + 1);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = question.trim().length > 0 && !isQaStreaming && !isAskingRef.current;

  return (
    <div className="glass-panel animate-slide-up">
      {/* ── Collapsible header ──────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-gray-300 hover:text-gray-100 transition-colors"
        aria-expanded={expanded}
      >
        <span className="text-sm font-medium">问答</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Expanded content ────────────────────── */}
      {expanded && (
        <>
          {/* Messages area */}
          <div className="max-h-80 overflow-y-auto px-4 pb-2 space-y-3">
            {visibleMessages.length === 0 && !isQaStreaming && (
              <p className="text-gray-500 text-sm text-center py-6 select-none">
                你可以在这里提问，了解故事背景或角色详情
              </p>
            )}

            {visibleMessages.map((msg) => (
              <QABubble key={msg.id || msg.content} message={msg} />
            ))}

            {/* Streaming assistant message */}
            {isQaStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-xl rounded-bl-sm px-3 py-2 text-sm bg-dark-800 text-gray-200">
                  <span className="streamed-text typing-cursor">{streamedText}</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="p-4 pt-2 border-t border-white/10">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入你的问题..."
                disabled={isQaStreaming || isAskingRef.current}
                className="input-base flex-1 text-sm"
                aria-label="输入问题"
              />
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                className="btn-primary text-sm shrink-0"
                aria-label="发送"
              >
                发送
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Individual message bubble ─────────────────────────── */

function QABubble({ message }: { message: QAMessage }) {
  const isUser = message.role === 'user';

  const rendered = useMemo(() => {
    if (isUser || !message.content) return null;
    try {
      const raw = marked.parse(message.content, { async: false }) as string;
      return DOMPurify.sanitize(raw);
    } catch {
      return null;
    }
  }, [message.content, isUser]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary-500/20 text-primary-100 rounded-br-sm'
            : 'bg-dark-800 text-gray-200 rounded-bl-sm'
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : rendered ? (
          <div
            className="prose-biography prose-sm max-w-none [&_p]:mb-1 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: rendered }}
          />
        ) : (
          <span className="whitespace-pre-wrap">{message.content}</span>
        )}
      </div>
    </div>
  );
}
