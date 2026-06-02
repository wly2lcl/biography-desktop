import { useState, useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { formatTimestamp } from '@/utils/format';
import type { SessionSummary, WorldInfo } from '@/types/models';
import ConfirmModal from '@/components/common/ConfirmModal';

/**
 * Extended world entry with metadata needed for game start.
 * TODO: Add isBuiltIn / type to WorldInfo in models.ts and the store's loadWorlds
 *       mapping so this local type can be removed.
 */
interface WorldEntry extends WorldInfo {
  isBuiltIn: boolean;
  type: 'single' | 'directory';
}

/** Derive world type from filename: .md files are single, directories otherwise. */
function getWorldType(filename: string): 'single' | 'directory' {
  return filename.endsWith('.md') ? 'single' : 'directory';
}

/** Determine whether a world is built-in. Currently all worlds loaded by the
 *  store are built-in; user worlds will require a store-level flag. */
function isBuiltInWorld(_filename: string): boolean {
  return true;
}

export default function StartScreen() {
  const {
    worlds,
    resumeSessions,
    isLoading,
    error,
    config,
    setShowWorldManager,
    setShowSettings,
    startBasicGame,
    generateSystemProposals,
    checkResume,
    resumeGame,
    deleteSession,
  } = useGameStore();

  const [playerName, setPlayerName] = useState('');
  const [selectedWorld, setSelectedWorld] = useState<string>('');
  const [gameMode, setGameMode] = useState<'basic' | 'system'>('basic');
  const [nameError, setNameError] = useState<string | null>(null);
  const [pendingDeleteSession, setPendingDeleteSession] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('bio_has_seen_onboarding');
  });

  // Load resume sessions on mount
  useEffect(() => {
    checkResume();
  }, [checkResume]);

  const validateName = (name: string): string | null => {
    if (name.length === 0) return null;
    if (name.length < 2) return '角色姓名至少需要 2 个字符';
    if (name.length > 20) return '角色姓名不能超过 20 个字符';
    return null;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setPlayerName(name);
    setNameError(validateName(name));
  };

  const handleNameBlur = () => {
    if (playerName.length > 0 && playerName.length < 2) {
      setNameError('角色姓名至少需要 2 个字符');
    }
  };

  // Build world entries with computed metadata
  const worldEntries: WorldEntry[] = worlds.map((w) => ({
    ...w,
    type: getWorldType(w.filename),
    isBuiltIn: isBuiltInWorld(w.filename),
  }));

  const selectedEntry = worldEntries.find((w) => w.filename === selectedWorld);
  const canStart =
    playerName.length >= 2 &&
    !nameError &&
    !!selectedEntry &&
    !isLoading;

  const handleStart = () => {
    if (!selectedEntry) return;

    if (gameMode === 'basic') {
      startBasicGame(
        playerName.trim(),
        selectedEntry.filename,
        selectedEntry.isBuiltIn,
        selectedEntry.type,
      );
    } else {
      generateSystemProposals(
        playerName.trim(),
        selectedEntry.filename,
        selectedEntry.isBuiltIn,
        selectedEntry.type,
      );
    }
  };

  return (
    <div className="w-full h-full flex items-start justify-center bg-dark-950 overflow-y-auto py-10">
      <div className="glass-panel p-8 w-full max-w-[500px] mx-4 animate-fade-in">
        {/* ── Title ─────────────────────────────────── */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-primary-300 mb-2 tracking-wide">
            传记生成器
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            在无限世界中创造属于你的传奇故事
          </p>
          {!config && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              <span>⚠️</span>
              <span>请先在设置中配置 LLM API Key →</span>
            </button>
          )}
        </div>

        {/* ── Onboarding hint ─────────────────────── */}
        {!config && showOnboarding && (
          <div className="glass-panel !bg-blue-900/20 border-blue-500/30 p-4 mb-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-blue-300 mb-1">欢迎使用传记生成器</h4>
                <p className="text-sm text-gray-300 mb-2">
                  本应用完全本地运行，数据保存在您的设备上。使用前请先在<strong>设置</strong>中配置 LLM API Key。
                </p>
                <p className="text-xs text-gray-400">
                  支持 DeepSeek（免费）、OpenAI、Ollama（本地）等提供商。配置后即可开始创作。
                </p>
              </div>
              <button
                onClick={() => {
                  setShowOnboarding(false);
                  localStorage.setItem('bio_has_seen_onboarding', '1');
                }}
                className="text-gray-500 hover:text-gray-300 shrink-0"
                title="不再显示"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Player name ───────────────────────────── */}
        <div className="mb-5">
          <label
            htmlFor="player-name"
            className="block text-sm text-gray-300 mb-1.5 font-medium"
          >
            角色姓名
          </label>
          <input
            id="player-name"
            type="text"
            value={playerName}
            onChange={handleNameChange}
            onBlur={handleNameBlur}
            placeholder="输入你的角色姓名"
            className="input-base"
            maxLength={20}
            disabled={isLoading}
            autoFocus
          />
          {nameError && (
            <p className="text-red-400 text-xs mt-1.5" role="alert">
              {nameError}
            </p>
          )}
        </div>

        {/* ── World selector ────────────────────────── */}
        <div className="mb-5">
          <label
            htmlFor="world-select"
            className="block text-sm text-gray-300 mb-1.5 font-medium"
          >
            选择世界
          </label>
          <div className="flex gap-2">
            <select
              id="world-select"
              value={selectedWorld}
              onChange={(e) => setSelectedWorld(e.target.value)}
              className="input-base flex-1"
              disabled={isLoading}
            >
              <option value="">— 请选择世界 —</option>
              {worldEntries.map((w) => (
                <option key={w.filename} value={w.filename}>
                  {w.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowWorldManager(true)}
              className="btn-secondary whitespace-nowrap"
              disabled={isLoading}
            >
              管理世界
            </button>
          </div>
          {selectedEntry?.description && (
            <p className="text-gray-500 text-xs mt-1.5 line-clamp-2">
              {selectedEntry.description}
            </p>
          )}
        </div>

        {/* ── Game mode ─────────────────────────────── */}
        <div className="mb-6">
          <label
            htmlFor="game-mode"
            className="block text-sm text-gray-300 mb-1.5 font-medium"
          >
            游戏模式
          </label>
          <select
            id="game-mode"
            value={gameMode}
            onChange={(e) => setGameMode(e.target.value as 'basic' | 'system')}
            className="input-base"
            disabled={isLoading}
          >
            <option value="basic">基础模式 — 直接开始冒险</option>
            <option value="system">系统模式 — 从构建系统开始</option>
          </select>
        </div>

        {/* ── Start button ──────────────────────────── */}
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          className="btn-primary w-full text-base py-2.5"
        >
          开始旅程
        </button>

        {/* ── Error message ─────────────────────────── */}
        {error && (
          <div
            className="mt-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg animate-slide-up"
            role="alert"
          >
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* ── Resume sessions ───────────────────────── */}
        {resumeSessions.length > 0 && (
          <div className="mt-8 pt-6 border-t border-white/10">
            <h2 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-widest">
              继续旅程
            </h2>
            <div className="space-y-3">
              {resumeSessions.map((session) => (
                <ResumeCard
                  key={session.sessionId}
                  session={session}
                  onResume={() => resumeGame(session.sessionId)}
                  onDelete={() => setPendingDeleteSession(session.sessionId)}
                  isLoading={isLoading}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {pendingDeleteSession && (
        <ConfirmModal
          title="删除旅程"
          message="确定要删除这个旅程吗？此操作不可恢复。"
          confirmText="删除"
          cancelText="取消"
          danger
          onConfirm={() => {
            deleteSession(pendingDeleteSession);
            setPendingDeleteSession(null);
          }}
          onCancel={() => setPendingDeleteSession(null)}
        />
      )}
    </div>
  );
}

/* ── Resume card sub-component ───────────────────────── */

function ResumeCard({
  session,
  onResume,
  onDelete,
  isLoading,
}: {
  session: SessionSummary;
  onResume: () => void;
  onDelete: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="card-base flex items-center justify-between gap-3 hover:border-primary-400/50 animate-slide-up">
      <div className="min-w-0 flex-1">
        <p className="text-gray-100 font-medium truncate">{session.playerName}</p>
        <p className="text-gray-500 text-xs mt-0.5 truncate">
          {session.world} · {session.historyLength} 章节 · {formatTimestamp(session.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 text-gray-500 hover:text-red-400 transition-colors"
          disabled={isLoading}
          title="删除旅程"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onResume}
          className="btn-primary text-sm py-1.5 px-4"
          disabled={isLoading}
        >
          继续
        </button>
      </div>
    </div>
  );
}
