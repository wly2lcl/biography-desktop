import { useState, useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { formatTimestamp } from '@/utils/format';
import type { SessionSummary, WorldInfo } from '@/types/models';
import { providerRequiresApiKey, providerRequiresCloudConsent } from '@/services/config';
import ConfirmModal from '@/components/common/ConfirmModal';

export function worldSelectionId(world: WorldInfo): string {
  const source = world.isBuiltIn ? 'builtin' : 'user';
  return `${source}:${world.type}:${world.filename}`;
}

export default function StartScreen() {
  const {
    worlds,
    resumeSessions,
    resumeWarning,
    isLoading,
    error,
    config,
    settings,
    apiKeyConfigured,
    setScreen,
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
    const normalized = name.trim();
    if (normalized.length === 0) return '角色姓名不能为空白';
    if (normalized.length < 2) return '角色姓名至少需要 2 个字符';
    if (normalized.length > 20) return '角色姓名不能超过 20 个字符';
    return null;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setPlayerName(name);
    setNameError(validateName(name));
  };

  const handleNameBlur = () => {
    setNameError(validateName(playerName));
  };

  const selectedEntry = worlds.find((world) => worldSelectionId(world) === selectedWorld);
  const providerReady = !!config
    && (!providerRequiresApiKey(settings.llmProvider) || apiKeyConfigured)
    && (!providerRequiresCloudConsent(settings.llmProvider)
      || settings.cloudPrivacyAcknowledged);
  const canStart =
    playerName.trim().length >= 2 &&
    !nameError &&
    !!selectedEntry &&
    !isLoading &&
    providerReady;

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
    <div className="w-full h-full flex flex-col bg-dark-950">
      {/* ── Top navigation bar ─────────────────────── */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-b border-white/10">
        <button
          type="button"
          onClick={() => setShowWorldManager(true)}
          className="btn-secondary text-sm py-1.5 px-3"
          title="管理世界"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          世界
        </button>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="btn-secondary text-sm py-1.5 px-3"
          title="设置"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          设置
        </button>
      </div>

      {/* ── Main content ───────────────────────────── */}
      <div className="flex-1 flex items-start justify-center overflow-y-auto py-10">
      <div className="glass-panel p-8 w-full max-w-[500px] mx-4 animate-fade-in">
        {/* ── Title ─────────────────────────────────── */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-primary-300 mb-2 tracking-wide">
            传记生成器
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            在无限世界中创造属于你的传奇故事
          </p>
          {!providerReady && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              <span>⚠️</span>
              <span>请先完成云端模型配置与隐私确认 →</span>
            </button>
          )}
        </div>

        {/* ── Onboarding hint ─────────────────────── */}
        {!providerReady && showOnboarding && (
          <div className="glass-panel !bg-blue-900/20 border-blue-500/30 p-4 mb-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-blue-300 mb-1">欢迎使用传记生成器</h4>
                <p className="text-sm text-gray-300 mb-3">
                  会话保存在您的设备上；生成内容时，角色名、世界观、剧情和提问会发送给所选云端模型服务商。
                </p>
                <ol className="text-xs text-gray-400 space-y-1 mb-3 list-decimal list-inside">
                  <li>选择 DeepSeek 或 OpenAI</li>
                  <li>填写 API Key，测试连接并确认隐私说明</li>
                  <li>选择示例世界，开始第一段旅程</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary text-xs py-1.5"
                    onClick={() => setShowSettings(true)}
                  >
                    开始配置
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1.5"
                    onClick={() => {
                      localStorage.setItem('bio_has_seen_onboarding', '1');
                      setShowOnboarding(false);
                      setScreen('demo');
                    }}
                  >
                    先体验离线示例
                  </button>
                </div>
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
              {worlds.map((w) => (
                <option key={worldSelectionId(w)} value={worldSelectionId(w)}>
                  {w.name}（{w.isBuiltIn ? '内置' : '用户'}）
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

        {!providerReady && (
          <button
            type="button"
            onClick={() => {
              localStorage.setItem('bio_has_seen_onboarding', '1');
              setShowOnboarding(false);
              setScreen('demo');
            }}
            className="btn-secondary w-full text-sm mt-3"
          >
            无需 API Key，先体验离线示例
          </button>
        )}

        {/* ── Error message ─────────────────────────── */}
        {error && (
          <div
            className="mt-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg animate-slide-up"
            role="alert"
          >
            <p className="text-red-400 text-sm">{error.message}</p>
          </div>
        )}

        {resumeWarning && (
          <div
            className="mt-4 p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg animate-slide-up"
            role="status"
          >
            <p className="text-amber-300 text-sm">{resumeWarning}</p>
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
