import { useState, useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import {
  EXPERIMENTAL_PROVIDERS_ENABLED,
  PRESET_PROVIDERS,
  providerRequiresCloudConsent,
} from '@/services/config';
import { validateLlmBaseUrl } from '@/services/llm';
import type { AppSettings } from '@/types/settings';
import type { ModelInfo, DownloadedModel, ServerStatus } from '@/types/models';
import { isTauriRuntime } from '@/services/runtime';
import { getErrorMessage } from '@/utils/errors';
import {
  formatDatabaseRestoreError,
  restoreSessionBackup,
} from '@/services/databaseRestore';

type TabId = 'llm' | 'advanced' | 'localModel' | 'data' | 'about';

interface TabDefinition {
  id: TabId;
  label: string;
}

const TABS: TabDefinition[] = [
  { id: 'llm', label: 'LLM' },
  { id: 'advanced', label: '高级' },
  ...(EXPERIMENTAL_PROVIDERS_ENABLED
    ? [{ id: 'localModel' as const, label: '本地模型' }]
    : []),
  { id: 'data', label: '数据' },
  { id: 'about', label: '关于' },
];

interface TempSettings extends AppSettings {
  // Additional UI-only state
}

interface BackupInfo {
  path: string;
  filename: string;
  size: number;
  modified: string;
}

/**
 * Settings overlay panel with LLM, Advanced, Data, and About tabs.
 *
 * Writes settings to the store only when the Save button is pressed.
 * The LLM test-connection result is shown in-line.
 */
export default function SettingsScreen() {
  const {
    settings, updateSettings, testLlmConnection, setShowSettings,
    serverStatus, availableModels, downloadedModels, downloadingModel, downloadProgress,
    refreshServerStatus, refreshAvailableModels, refreshDownloadedModels,
    startLocalServer, stopLocalServer,
    startDownloadModel, cancelDownloadModel, deleteDownloadedModel,
    ensureBinary,
    isStreaming, isPersistingSession, isDataMutationInProgress,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<TabId>('llm');
  const [draft, setDraft] = useState<TempSettings>(() => ({ ...settings }));
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'failure'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dbInfo, setDbInfo] = useState<{ path: string; size: number; sessionCount: number; activeCount: number } | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const baseUrlValidation = validateLlmBaseUrl(
    draft.baseUrl,
    draft.llmProvider
  );
  const baseUrlError = baseUrlValidation.valid ? null : baseUrlValidation.error;

  // Refs for paste
  const apiKeyRef = useRef<HTMLInputElement>(null);

  // ── Refresh DB info ──────────────────────────────
  const refreshDbInfoStrict = useCallback(async () => {
    if (!isTauriRuntime()) {
      setDbInfo(null);
      return;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    const info = await invoke('get_database_info') as {
      path: string;
      size: number;
      sessionCount: number;
      activeCount: number;
    };
    setDbInfo(info);
  }, []);

  const refreshDbInfo = useCallback(async () => {
    try {
      await refreshDbInfoStrict();
    } catch {
      setDbInfo(null);
    }
  }, [refreshDbInfoStrict]);

  const refreshBackupsStrict = useCallback(async () => {
    if (!isTauriRuntime()) {
      setBackups([]);
      return;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    setBackups(await invoke('list_backups') as BackupInfo[]);
  }, []);

  const refreshBackups = useCallback(async () => {
    try {
      await refreshBackupsStrict();
    } catch {
      setBackups([]);
    }
  }, [refreshBackupsStrict]);

  // Fetch db info on mount
  useEffect(() => {
    refreshDbInfo();
    refreshBackups();
  }, [refreshDbInfo, refreshBackups]);

  // Reset draft when settings change externally
  useEffect(() => {
    setDraft({ ...settings });
  }, [settings]);

  // ── Preset handler ─────────────────────────────────
  const handlePresetChange = useCallback((presetId: string) => {
    const preset = PRESET_PROVIDERS.find((p) => p.id === presetId);
    if (preset) {
      setDraft((prev) => ({
        ...prev,
        llmProvider: preset.id as AppSettings['llmProvider'],
        baseUrl: preset.baseUrl,
        model: preset.model,
      }));
    } else {
      // Custom provider — keep existing values
      setDraft((prev) => ({
        ...prev,
        llmProvider: 'custom',
      }));
    }
  }, []);

  // ── Connection test ────────────────────────────────
  const handleTestConnection = useCallback(async () => {
    if (baseUrlError) {
      setTestResult('failure');
      return;
    }
    setTestResult('testing');
    try {
      const ok = await testLlmConnection(draft);
      setTestResult(ok ? 'success' : 'failure');
    } catch {
      setTestResult('failure');
    }
  }, [baseUrlError, draft, testLlmConnection]);

  // ── Save ──────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if ((providerRequiresCloudConsent(draft.llmProvider)
      && !draft.cloudPrivacyAcknowledged) || baseUrlError) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateSettings(draft);
      setShowSettings(false);
    } catch (error) {
      setSaveError(getErrorMessage(error, '保存设置失败，请重试'));
    } finally {
      setIsSaving(false);
    }
  }, [baseUrlError, draft, updateSettings, setShowSettings]);

  // ── Paste API key from clipboard ──────────────────
  const handlePasteApiKey = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setDraft((prev) => ({ ...prev, apiKey: text }));
        // Focus the input after paste
        apiKeyRef.current?.focus();
      }
    } catch {
      // Clipboard access denied — ignore
    }
  }, []);

  // ── Close on Escape ───────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setShowSettings]);

  // ── Load local model data on mount ────────────────
  useEffect(() => {
    if (EXPERIMENTAL_PROVIDERS_ENABLED) {
      refreshServerStatus();
      refreshAvailableModels();
      refreshDownloadedModels();
    }
  }, []);

  // ── Generic number updater ─────────────────────────
  const updateNumber = (key: keyof TempSettings, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setDraft((prev) => ({ ...prev, [key]: num }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/90 backdrop-blur-sm animate-fade-in">
      {/* Panel */}
      <div className="glass-panel w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* ── Header ──────────────────────────────── */}
        <div className="relative px-6 pt-6 pb-0">
          <h2 className="text-lg font-semibold text-gray-100">设置</h2>
          <button
            type="button"
            onClick={() => setShowSettings(false)}
            className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-200 transition-colors rounded-lg hover:bg-dark-800"
            aria-label="关闭设置"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Tab bar ─────────────────────────────── */}
        <div className="flex border-b border-white/10 px-6 mt-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-primary-300 border-primary-400'
                  : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ─────────────────────────── */}
        <div className="p-6">
          {activeTab === 'llm' && (
            <LlmTabContent
              draft={draft}
              baseUrlError={baseUrlError}
              showApiKey={showApiKey}
              testResult={testResult}
              apiKeyRef={apiKeyRef}
              onPresetChange={handlePresetChange}
              onShowApiKeyToggle={() => setShowApiKey((v) => !v)}
              onPasteApiKey={handlePasteApiKey}
              onUpdate={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
              onUpdateNumber={updateNumber}
              onTestConnection={handleTestConnection}
              onPrivacyChange={(checked) => setDraft((prev) => ({
                ...prev,
                cloudPrivacyAcknowledged: checked,
              }))}
            />
          )}
          {activeTab === 'advanced' && (
            <AdvancedTabContent
              draft={draft}
              onUpdateNumber={updateNumber}
            />
          )}
          {activeTab === 'localModel' && (
            <LocalModelTabContent
              serverStatus={serverStatus}
              availableModels={availableModels}
              downloadedModels={downloadedModels}
              downloadingModel={downloadingModel}
              downloadProgress={downloadProgress}
              onStartServer={startLocalServer}
              onStopServer={stopLocalServer}
              onStartDownload={startDownloadModel}
              onCancelDownload={cancelDownloadModel}
              onDeleteModel={deleteDownloadedModel}
              onEnsureBinary={ensureBinary}
            />
          )}
          {activeTab === 'data' && (
            <DataTabContent
              dbInfo={dbInfo}
              backups={backups}
              onRefresh={refreshDbInfo}
              onRefreshBackups={refreshBackups}
              onRefreshStrict={refreshDbInfoStrict}
              onRefreshBackupsStrict={refreshBackupsStrict}
              dataActionsDisabled={
                isStreaming || isPersistingSession || isDataMutationInProgress
              }
            />
          )}
          {activeTab === 'about' && (
            <AboutTabContent />
          )}
        </div>

        {/* ── Footer ──────────────────────────────── */}
        <div className="flex items-center gap-3 px-6 pb-6 pt-2 border-t border-white/10">
          {saveError && (
            <p role="alert" className="flex-1 text-sm text-red-400">
              {saveError}
            </p>
          )}
          <div className="flex justify-end gap-3 ml-auto">
          <button
            type="button"
            onClick={() => setShowSettings(false)}
            className="btn-secondary text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || (providerRequiresCloudConsent(draft.llmProvider)
              && !draft.cloudPrivacyAcknowledged) || !!baseUrlError}
            className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '保存中...' : '保存设置'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   LLM Tab
   ══════════════════════════════════════════════════════════ */

function LlmTabContent({
  draft,
  baseUrlError,
  showApiKey,
  testResult,
  apiKeyRef,
  onPresetChange,
  onShowApiKeyToggle,
  onPasteApiKey,
  onUpdate,
  onUpdateNumber,
  onTestConnection,
  onPrivacyChange,
}: {
  draft: AppSettings;
  baseUrlError: string | null;
  showApiKey: boolean;
  testResult: 'idle' | 'testing' | 'success' | 'failure';
  apiKeyRef: { current: HTMLInputElement | null };
  onPresetChange: (id: string) => void;
  onShowApiKeyToggle: () => void;
  onPasteApiKey: () => void;
  onUpdate: (key: string, value: string) => void;
  onUpdateNumber: (key: keyof AppSettings, value: string) => void;
  onTestConnection: () => void;
  onPrivacyChange: (checked: boolean) => void;
}) {
  const testBtnLabel =
    testResult === 'testing'
      ? '测试中...'
      : testResult === 'success'
        ? '✓ 连接成功'
        : testResult === 'failure'
          ? '✗ 连接失败'
          : '测试连接';

  const testBtnColor =
    testResult === 'success'
      ? 'border-green-500/40 text-green-400'
      : testResult === 'failure'
        ? 'border-red-500/40 text-red-400'
        : '';
  const selectedPreset = PRESET_PROVIDERS.find(
    (provider) => provider.id === draft.llmProvider
  );
  const isStableCloudProvider =
    draft.llmProvider === 'deepseek' || draft.llmProvider === 'openai';
  const normalizedDraftBaseUrl = draft.baseUrl.trim().replace(/\/+$/, '').toLowerCase();
  const normalizedOfficialBaseUrl = selectedPreset?.baseUrl
    .replace(/\/+$/, '')
    .toLowerCase();
  const usesCustomBaseUrl = isStableCloudProvider
    && normalizedDraftBaseUrl !== ''
    && normalizedDraftBaseUrl !== normalizedOfficialBaseUrl;

  return (
    <div className="space-y-5">
      {/* Provider preset */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-300 mb-2.5">服务商</legend>
        <div className="flex flex-wrap gap-2">
          {PRESET_PROVIDERS.map((provider) => (
            <label
              key={provider.id}
              className={`cursor-pointer px-3.5 py-2 rounded-lg border text-sm transition-colors ${
                draft.llmProvider === provider.id
                  ? 'border-primary-400 bg-primary-400/10 text-primary-200'
                  : 'border-white/10 bg-dark-800 text-gray-400 hover:border-primary-400/40 hover:text-gray-200'
              }`}
            >
              <input
                type="radio"
                name="llmProvider"
                value={provider.id}
                checked={draft.llmProvider === provider.id}
                onChange={() => onPresetChange(provider.id)}
                className="sr-only"
              />
              <span>{provider.name}</span>
            </label>
          ))}
          {EXPERIMENTAL_PROVIDERS_ENABLED && <label
            className={`cursor-pointer px-3.5 py-2 rounded-lg border text-sm transition-colors ${
              draft.llmProvider === 'custom'
                ? 'border-primary-400 bg-primary-400/10 text-primary-200'
                : 'border-white/10 bg-dark-800 text-gray-400 hover:border-primary-400/40 hover:text-gray-200'
            }`}
          >
            <input
              type="radio"
              name="llmProvider"
              value="custom"
              checked={draft.llmProvider === 'custom'}
              onChange={() => onPresetChange('custom')}
              className="sr-only"
            />
            自定义
          </label>}
        </div>
      </fieldset>

      {/* API Key */}
      {draft.llmProvider === 'ollama' || draft.llmProvider === 'llamacpp'
        || draft.llmProvider === 'llamacpp_local' ? (
        <div>
          <label className="block text-sm text-gray-300 mb-1.5 font-medium">
            API Key
          </label>
          <div className="input-base text-gray-500 bg-dark-800/50 cursor-not-allowed select-none">
            无需 API Key（本地模型）
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="settings-api-key" className="block text-sm text-gray-300 mb-1.5 font-medium">
            API Key
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={apiKeyRef}
                id="settings-api-key"
                type={showApiKey ? 'text' : 'password'}
                value={draft.apiKey}
                onChange={(e) => onUpdate('apiKey', e.target.value)}
                placeholder="sk-..."
                className="input-base pr-10"
              />
              <button
                type="button"
                onClick={onShowApiKeyToggle}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300 transition-colors"
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showApiKey ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={onPasteApiKey}
              className="btn-secondary text-sm whitespace-nowrap"
              title="从剪贴板粘贴"
            >
              粘贴
            </button>
          </div>
        </div>
      )}

      {/* Base URL */}
      <div>
        <label htmlFor="settings-base-url" className="block text-sm text-gray-300 mb-1.5 font-medium">
          Base URL
        </label>
        <input
          id="settings-base-url"
          type="text"
          value={draft.baseUrl}
          onChange={(e) => onUpdate('baseUrl', e.target.value)}
          placeholder={selectedPreset?.baseUrl ?? 'https://example.com'}
          className="input-base"
        />
        {isStableCloudProvider && (
          <p className={`mt-1.5 text-xs ${usesCustomBaseUrl ? 'text-amber-300' : 'text-gray-500'}`}>
            {usesCustomBaseUrl
              ? '当前请求、API Key 与生成上下文将发送到此自定义地址，请确认端点可信。'
              : `留空时自动使用 ${selectedPreset?.baseUrl}。`}
          </p>
        )}
        {baseUrlError && (
          <p role="alert" className="mt-1.5 text-xs text-red-400">
            {baseUrlError}
          </p>
        )}
      </div>

      {/* Model */}
      <div>
        <label htmlFor="settings-model" className="block text-sm text-gray-300 mb-1.5 font-medium">
          Model
        </label>
        <input
          id="settings-model"
          type="text"
          value={draft.model}
          onChange={(e) => onUpdate('model', e.target.value)}
          placeholder="deepseek-chat"
          className="input-base"
        />
      </div>

      {/* Temperature */}
      <SliderField
        id="settings-temperature"
        label="Temperature"
        min={0}
        max={2}
        step={0.1}
        value={draft.temperature}
        displayValue={draft.temperature.toFixed(1)}
        onChange={(v) => onUpdateNumber('temperature', v)}
      />

      {/* MaxTokens */}
      <SliderField
        id="settings-max-tokens"
        label="Max Tokens"
        min={256}
        max={32768}
        step={256}
        value={draft.maxTokens}
        displayValue={String(draft.maxTokens)}
        onChange={(v) => onUpdateNumber('maxTokens', v)}
      />

      {/* Timeout */}
      <SliderField
        id="settings-timeout"
        label="超时 (秒)"
        min={10}
        max={300}
        step={5}
        value={draft.timeout / 1000}
        displayValue={`${draft.timeout / 1000}s`}
        onChange={(v) => onUpdateNumber('timeout', String(parseFloat(v) * 1000))}
      />

      {/* Test connection */}
      <div>
        <button
          type="button"
          onClick={onTestConnection}
          disabled={testResult === 'testing' || !!baseUrlError}
          className={`btn-secondary text-sm ${testBtnColor}`}
        >
          {testBtnLabel}
        </button>
      </div>

      <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
        <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.cloudPrivacyAcknowledged}
            onChange={(event) => onPrivacyChange(event.target.checked)}
            className="mt-1"
          />
          <span>
            我了解角色名、世界观、剧情历史和提问会发送给所选云端模型服务商。
            Tauri 正式版会将 API Key 存入系统钥匙串；Web 模式仅用于开发调试。
          </span>
        </label>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   高级 Tab
   ══════════════════════════════════════════════════════════ */

interface ParamDef {
  key: keyof AppSettings;
  label: string;
  min: number;
  max: number;
  step?: number;
}

const GAME_PARAMS: ParamDef[] = [
  { key: 'maxChoices', label: '最大选项数', min: 3, max: 100 },
  { key: 'maxAutoContinue', label: '最大自动续写', min: 1, max: 20 },
  { key: 'summaryThreshold', label: '摘要触发章节数', min: 5, max: 999 },
  { key: 'summaryKeepLatest', label: '摘要保留最近章节', min: 3, max: 999 },
  { key: 'maxQaHistory', label: '问答历史上限', min: 1, max: 999 },
  { key: 'maxScenariosInMemory', label: '内存中场景数', min: 1, max: 20 },
  { key: 'worldCacheTTL', label: '世界缓存 TTL (秒)', min: 10, max: 3600, step: 10 },
  { key: 'worldCacheMaxSize', label: '世界缓存上限 (个)', min: 1, max: 100 },
  { key: 'worldMaxChars', label: '世界内容最大字符', min: 1000, max: 200000, step: 1000 },
  { key: 'maxSessionsInList', label: '会话列表上限', min: 1, max: 200 },
  { key: 'llmMaxRetries', label: 'LLM 最大重试', min: 0, max: 10 },
];

function AdvancedTabContent({
  draft,
  onUpdateNumber,
}: {
  draft: AppSettings;
  onUpdateNumber: (key: keyof AppSettings, value: string) => void;
}) {
  return (
    <div>
      <p className="text-sm text-gray-500 mb-4 leading-relaxed">
        调整游戏引擎参数。修改后需要保存才会生效。
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {GAME_PARAMS.map((param) => (
          <div key={param.key}>
            <label
              htmlFor={`param-${param.key}`}
              className="block text-sm text-gray-300 mb-1 font-medium"
            >
              {param.label}
            </label>
            <input
              id={`param-${param.key}`}
              type="number"
              min={param.min}
              max={param.max}
              step={param.step ?? 1}
              value={String(draft[param.key])}
              onChange={(e) => onUpdateNumber(param.key, e.target.value)}
              className="input-base"
            />
            <p className="text-xs text-gray-600 mt-0.5">
              {param.min} – {param.max}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   数据 Tab
   ══════════════════════════════════════════════════════════ */

function DataTabContent({
  dbInfo,
  backups,
  onRefresh,
  onRefreshBackups,
  onRefreshStrict,
  onRefreshBackupsStrict,
  dataActionsDisabled,
}: {
  dbInfo: { path: string; size: number; sessionCount: number; activeCount: number } | null;
  backups: BackupInfo[];
  onRefresh: () => Promise<void>;
  onRefreshBackups: () => Promise<void>;
  onRefreshStrict: () => Promise<void>;
  onRefreshBackupsStrict: () => Promise<void>;
  dataActionsDisabled: boolean;
}) {
  const desktopAvailable = isTauriRuntime();
  const handleBackup = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const backupPath = await invoke('backup_database') as string;
      alert(`备份成功！\n文件位置: ${backupPath}`);
      await Promise.all([onRefresh(), onRefreshBackups()]);
    } catch (err) {
      alert(`备份失败: ${getErrorMessage(err, '未知错误')}`);
    }
  }, [onRefresh, onRefreshBackups]);

  const handleRestore = useCallback(async (backup: BackupInfo) => {
    if (!window.confirm(
      `确定恢复「${backup.filename}」吗？当前会话将被备份内容替换，现有设置和 API Key 会保留。`
    )) return;
    const store = useGameStore.getState();
    let prepared = false;
    try {
      await store.prepareForDataMutation();
      prepared = true;
      await restoreSessionBackup(backup.path, {
        resetCurrentSession: store.newGame,
        refreshResumeSessions: () => store.checkResume({ throwOnError: true }),
        refreshDatabaseInfo: onRefreshStrict,
        refreshBackups: onRefreshBackupsStrict,
      });
      alert('数据库恢复成功，当前设置和 API Key 已保留');
    } catch (err) {
      alert(formatDatabaseRestoreError(err));
    } finally {
      if (prepared) store.finishDataMutation();
    }
  }, [onRefreshStrict, onRefreshBackupsStrict]);

  const handleDeleteBackup = useCallback(async (backup: BackupInfo) => {
    if (!window.confirm(`确定删除备份「${backup.filename}」吗？`)) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_backup', { backupPath: backup.path });
      await onRefreshBackups();
    } catch (err) {
      alert(`删除备份失败: ${getErrorMessage(err, '未知错误')}`);
    }
  }, [onRefreshBackups]);

  const handleCleanup = useCallback(async () => {
    if (!window.confirm('确定永久删除所有已结束会话及其传记吗？')) return;
    const store = useGameStore.getState();
    let prepared = false;
    try {
      await store.prepareForDataMutation();
      prepared = true;
      const { invoke } = await import('@tauri-apps/api/core');
      const count = await invoke('clear_ended_sessions') as number;
      if (store.session && !store.session.isActive) store.newGame();
      await store.checkResume();
      alert(`已清理 ${count} 个已结束会话`);
      await onRefresh();
    } catch (err) {
      alert(`清理失败: ${getErrorMessage(err, '未知错误')}`);
    } finally {
      if (prepared) store.finishDataMutation();
    }
  }, [onRefresh]);

  const handleCleanupAll = useCallback(async () => {
    if (!window.confirm('确定永久删除全部会话吗？此操作无法撤销。')) return;
    const store = useGameStore.getState();
    let prepared = false;
    try {
      await store.prepareForDataMutation();
      prepared = true;
      const { invoke } = await import('@tauri-apps/api/core');
      const count = await invoke('clear_all_sessions') as number;
      store.newGame();
      await store.checkResume();
      alert(`已清理全部 ${count} 个会话`);
      await onRefresh();
    } catch (err) {
      alert(`清理失败: ${getErrorMessage(err, '未知错误')}`);
    } finally {
      if (prepared) store.finishDataMutation();
    }
  }, [onRefresh]);

  const handleExportAll = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const data = await invoke('export_full_data') as string;
      const filePath = await save({
        title: '导出数据',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, data);
        alert('数据导出成功！');
        onRefresh?.();
      }
    } catch (err) {
      alert(`导出失败: ${getErrorMessage(err, '未知错误')}`);
    }
  }, [onRefresh]);

  const handleImportAll = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await open({
        title: '导入数据',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (filePath) {
        const data = await readTextFile(filePath);
        if (!window.confirm('导入会按 sessionId 新增或覆盖会话。确定继续吗？')) return;
        const store = useGameStore.getState();
        let prepared = false;
        try {
          await store.prepareForDataMutation();
          prepared = true;
          const result = await invoke('import_full_data', { data }) as string;
          store.newGame();
          await store.checkResume();
          alert(result);
          onRefresh?.();
        } finally {
          if (prepared) store.finishDataMutation();
        }
      }
    } catch (err) {
      alert(`导入失败: ${getErrorMessage(err, '未知错误')}`);
    }
  }, [onRefresh]);

  if (!desktopAvailable) {
    return (
      <div className="glass-panel !bg-dark-800/50 p-4">
        <p className="text-sm text-gray-400">
          Web 模式仅用于开发调试；数据库备份、恢复和全量导入导出只在 Tauri 桌面版提供。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Database info */}
      <div className="glass-panel !bg-dark-800/50 p-4 space-y-2">
        <h3 className="text-sm font-medium text-gray-200 mb-2">数据库信息</h3>
        {dbInfo ? (
          <>
            <InfoRow label="路径" value={dbInfo.path} />
            <InfoRow label="大小" value={`${(dbInfo.size / 1024).toFixed(1)} KB`} />
            <InfoRow label="会话总数" value={String(dbInfo.sessionCount)} />
            <InfoRow label="活跃会话" value={String(dbInfo.activeCount)} />
          </>
        ) : <p className="text-gray-500 text-sm">暂时无法读取数据库信息</p>}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {dataActionsDisabled && (
          <p className="text-xs text-amber-300">
            正在生成内容、保存会话或执行其他数据操作，请稍候。
          </p>
        )}
        <button
          type="button"
          onClick={handleBackup}
          disabled={dataActionsDisabled}
          className="btn-secondary text-sm w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
        >
          备份数据库
        </button>
        {backups.length > 0 && (
          <div className="space-y-2 pt-1">
            <h4 className="text-sm font-medium text-gray-300">最近备份</h4>
            {backups.map((backup) => (
              <div
                key={backup.path}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-dark-800/40 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-200">{backup.filename}</p>
                  <p className="text-xs text-gray-500">
                    {backup.modified} · {(backup.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(backup)}
                  disabled={dataActionsDisabled}
                  className="btn-secondary px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  恢复
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteBackup(backup)}
                  disabled={dataActionsDisabled}
                  className="btn-danger px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={handleCleanup}
            disabled={dataActionsDisabled}
            className="btn-danger text-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            清理已结束会话
          </button>
          <p className="text-xs text-gray-500 leading-relaxed">
            此操作将永久删除所有已结束的会话及其传记数据，无法撤销。
          </p>
        </div>
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={handleCleanupAll}
            disabled={dataActionsDisabled}
            className="btn-danger text-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            清理全部会话
          </button>
          <p className="text-xs text-gray-500 leading-relaxed">
            此操作将永久删除所有会话数据，无法撤销。
          </p>
        </div>
      </div>

      {/* Export / Import all data */}
      <div className="space-y-3 pt-3 border-t border-gray-700/50">
        <h4 className="text-sm font-medium text-gray-300">全部数据</h4>
        <button
          type="button"
          onClick={handleExportAll}
          disabled={dataActionsDisabled}
          className="btn-secondary text-sm w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
        >
          导出全部数据（JSON）
        </button>
        <button
          type="button"
          onClick={handleImportAll}
          disabled={dataActionsDisabled}
          className="btn-primary text-sm w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
        >
          导入全部数据（JSON）
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200 font-mono text-xs">{value}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   关于 Tab
   ══════════════════════════════════════════════════════════ */

function AboutTabContent() {
  const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.0';
  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <h3 className="text-xl font-serif text-primary-300 mb-1">传记生成器</h3>
        <p className="text-gray-500 text-sm">v{APP_VERSION}</p>
      </div>

      <div className="glass-panel !bg-dark-800/50 p-4 space-y-2">
        <InfoRow label="应用名称" value="传记生成器" />
        <InfoRow label="版本" value={APP_VERSION} />
        <InfoRow label="许可证" value="MIT" />
      </div>

      <div className="text-sm text-gray-400 leading-relaxed space-y-2">
        <p>
          传记生成器是一款基于 LLM 的交互式叙事应用。你可以在各种世界中扮演角色，
          做出选择推动故事发展，最终生成一部专属的传记。
        </p>
        <p>
          稳定版使用 DeepSeek 或 OpenAI 云端模型驱动；实验提供商和本地模型仅在开发构建中开放。
        </p>
      </div>

      <div>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          GitHub
        </a>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   本地模型 Tab
   ══════════════════════════════════════════════════════════ */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LocalModelTabContent({
  serverStatus,
  availableModels,
  downloadedModels,
  downloadingModel,
  downloadProgress,
  onStartServer,
  onStopServer,
  onStartDownload,
  onCancelDownload,
  onDeleteModel,
  onEnsureBinary,
}: {
  serverStatus: ServerStatus | null;
  availableModels: ModelInfo[];
  downloadedModels: DownloadedModel[];
  downloadingModel: string | null;
  downloadProgress: number;
  onStartServer: (modelPath: string, gpuLayers?: number, contextSize?: number) => Promise<void>;
  onStopServer: () => Promise<void>;
  onStartDownload: (modelId: string) => Promise<void>;
  onCancelDownload: () => Promise<void>;
  onDeleteModel: (modelId: string) => Promise<void>;
  onEnsureBinary: () => Promise<string>;
}) {
  const [gpuLayers, setGpuLayers] = useState(0);
  const [binaryReady, setBinaryReady] = useState(false);
  const [ensuring, setEnsuring] = useState(false);
  const startingModelRef = useRef<string | null>(null);

  // ── Ensure binary on mount ──────────────────────────
  useEffect(() => {
    onEnsureBinary().then(() => setBinaryReady(true)).catch(() => setBinaryReady(false));
  }, []);

  // ── Server start handler ────────────────────────────
  const handleStartServer = useCallback(async (modelPath: string) => {
    startingModelRef.current = modelPath;
    await onStartServer(modelPath, gpuLayers);
    startingModelRef.current = null;
  }, [gpuLayers, onStartServer]);

  const isRunning = serverStatus?.is_running ?? false;
  const downloadedMap = new Map(downloadedModels.map((m) => [m.id, m]));

  return (
    <div className="space-y-5">
      {/* ── Server Status ──────────────────────────── */}
      <div className="glass-panel !bg-dark-800/50 p-4 space-y-2">
        <h3 className="text-sm font-medium text-gray-200 mb-2">服务器状态</h3>
        {isRunning ? (
          <>
            <InfoRow label="状态" value="运行中" />
            {serverStatus?.port != null && (
              <InfoRow label="端口" value={`http://localhost:${serverStatus.port}`} />
            )}
            {serverStatus?.model_name != null && (
              <InfoRow label="模型" value={serverStatus.model_name} />
            )}
            {serverStatus?.gpu_layers != null && (
              <InfoRow label="GPU 层数" value={String(serverStatus.gpu_layers)} />
            )}
            <button
              type="button"
              onClick={onStopServer}
              className="btn-danger text-sm mt-2"
            >
              停止服务
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-500 text-sm">服务未运行</p>
            {!binaryReady ? (
              <div>
                <p className="text-xs text-yellow-500 mb-2">正在检查二进制文件...</p>
                <button
                  type="button"
                  disabled={ensuring}
                  onClick={async () => {
                    setEnsuring(true);
                    try {
                      await onEnsureBinary();
                      setBinaryReady(true);
                    } catch {
                      setBinaryReady(false);
                    }
                    setEnsuring(false);
                  }}
                  className="btn-secondary text-sm"
                >
                  {ensuring ? '检查中...' : '检查二进制'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-green-500">二进制文件就绪</p>
            )}
          </>
        )}
      </div>

      {/* ── GPU 层数 ──────────────────────────────── */}
      <SliderField
        id="local-model-gpu-layers"
        label="GPU 加速层数（0 = 仅 CPU）"
        min={0}
        max={999}
        step={1}
        value={gpuLayers}
        displayValue={String(gpuLayers)}
        onChange={(v) => setGpuLayers(parseInt(v, 10) || 0)}
      />

      {/* ── 已下载模型 ─────────────────────────────── */}
      <div>
        <h3 className="text-sm font-medium text-gray-200 mb-2">已下载模型</h3>
        {downloadedModels.length === 0 ? (
          <p className="text-gray-500 text-sm">暂无已下载模型</p>
        ) : (
          <div className="space-y-2">
            {downloadedModels.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between glass-panel !bg-dark-800/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-200 truncate">{model.name}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(model.file_size)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 ml-3">
                  <button
                    type="button"
                    onClick={() => handleStartServer(model.file_path)}
                    disabled={isRunning}
                    className="btn-primary text-xs"
                  >
                    {isRunning && startingModelRef.current === model.file_path
                      ? '启动中...'
                      : '启动'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteModel(model.id)}
                    className="btn-danger text-xs"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 可用模型 ──────────────────────────────── */}
      <div>
        <h3 className="text-sm font-medium text-gray-200 mb-2">可用模型</h3>
        {availableModels.length === 0 ? (
          <p className="text-gray-500 text-sm">暂无可用模型列表</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {availableModels
              .filter((m) => !downloadedMap.has(m.id))
              .map((model) => {
                const isDownloading = downloadingModel === model.id;
                return (
                  <div
                    key={model.id}
                    className="flex items-center justify-between glass-panel !bg-dark-800/50 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-200 truncate">{model.name}</p>
                        {model.recommended && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-400/20 text-primary-300 shrink-0">
                            推荐
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {model.size_gb}GB · {model.quantization}
                        {model.min_ram_gb > 0 && ` · 最低 ${model.min_ram_gb}GB RAM`}
                      </p>
                    </div>
                    <div className="shrink-0 ml-3">
                      {isDownloading ? (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-dark-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 rounded-full transition-all duration-300"
                              style={{ width: `${downloadProgress}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right">
                            {Math.round(downloadProgress)}%
                          </span>
                          <button
                            type="button"
                            onClick={onCancelDownload}
                            className="btn-danger text-xs"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onStartDownload(model.id)}
                          className="btn-primary text-xs"
                        >
                          下载
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Shared: Slider field
   ══════════════════════════════════════════════════════════ */

function SliderField({
  id,
  label,
  min,
  max,
  step,
  value,
  displayValue,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  displayValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <label htmlFor={id} className="text-sm text-gray-300 font-medium">
          {label}
        </label>
        <span className="text-xs text-gray-500 font-mono">{displayValue}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-1.5 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-primary-500"
      />
    </div>
  );
}
