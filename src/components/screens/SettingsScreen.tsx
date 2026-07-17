import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import {
  EXPERIMENTAL_PROVIDERS_ENABLED,
  PRESET_PROVIDERS,
  apiKeyStorageScope,
  isApiKeyConfigured,
  providerRequiresCloudConsent,
  providerSupportsApiKey,
} from '@/services/config';
import { validateLlmBaseUrl } from '@/services/llm';
import type { AppSettings } from '@/types/settings';
import { isTauriRuntime } from '@/services/runtime';
import { getErrorMessage } from '@/utils/errors';
import { desktopDataGateway } from '@/infrastructure/desktopDataGateway';
import type { BackupInfo, DatabaseInfo } from '@/infrastructure/contracts';
import AboutTab from '@/components/settings/AboutTab';
import DataTab from '@/components/settings/DataTab';

const LocalModelTab = EXPERIMENTAL_PROVIDERS_ENABLED
  ? lazy(() => import('@/components/settings/LocalModelTab'))
  : null;

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

/**
 * Settings overlay panel with LLM, Advanced, Data, and About tabs.
 *
 * Writes settings to the store only when the Save button is pressed.
 * The LLM test-connection result is shown in-line.
 */
export default function SettingsScreen({ degradedMode = false }: { degradedMode?: boolean }) {
  const {
    settings, apiKeyConfigured, updateSettings, clearApiKey, testLlmConnection, setShowSettings,
    serverStatus, availableModels, downloadedModels, downloadingModel, downloadProgress,
    refreshServerStatus, refreshAvailableModels, refreshDownloadedModels,
    startLocalServer, stopLocalServer,
    startDownloadModel, cancelDownloadModel, deleteDownloadedModel,
    ensureBinary,
    isStreaming, isPersistingSession, isDataMutationInProgress,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<TabId>('llm');
  const [draft, setDraft] = useState<TempSettings>(() => ({ ...settings }));
  const [draftApiKeyConfigured, setDraftApiKeyConfigured] = useState(apiKeyConfigured);
  const [checkedApiKeyScope, setCheckedApiKeyScope] = useState<string | null>(() => {
    try {
      return apiKeyStorageScope(settings.llmProvider, settings.baseUrl);
    } catch {
      return null;
    }
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'failure'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const baseUrlValidation = validateLlmBaseUrl(
    draft.baseUrl,
    draft.llmProvider
  );
  const baseUrlError = baseUrlValidation.valid ? null : baseUrlValidation.error;
  let draftApiKeyScope: string | null = null;
  if (!baseUrlError && providerSupportsApiKey(draft.llmProvider)) {
    try {
      draftApiKeyScope = apiKeyStorageScope(draft.llmProvider, draft.baseUrl);
    } catch {
      draftApiKeyScope = null;
    }
  }
  let normalizedDraftBaseUrl = `invalid:${draft.baseUrl.trim()}`;
  if (baseUrlValidation.valid) {
    normalizedDraftBaseUrl = new URL(baseUrlValidation.resolvedBaseUrl)
      .toString()
      .replace(/\/+$/, '')
      .replace(/\/v1$/i, '');
  }
  const draftConnectionIdentity = `${draft.llmProvider}:${normalizedDraftBaseUrl}`;
  const previousDraftConnectionIdentityRef = useRef(draftConnectionIdentity);

  useEffect(() => {
    if (previousDraftConnectionIdentityRef.current === draftConnectionIdentity) return;
    previousDraftConnectionIdentityRef.current = draftConnectionIdentity;
    setDraft((previous) => previous.apiKey
      ? { ...previous, apiKey: '' }
      : previous);
    setShowApiKey(false);
    setTestResult('idle');
  }, [draftConnectionIdentity]);

  useEffect(() => {
    if (baseUrlError || !providerSupportsApiKey(draft.llmProvider)) {
      setDraftApiKeyConfigured(false);
      setCheckedApiKeyScope(null);
      return;
    }
    const scope = apiKeyStorageScope(draft.llmProvider, draft.baseUrl);
    let cancelled = false;
    void isApiKeyConfigured(draft.llmProvider, draft.baseUrl)
      .then((configured) => {
        if (!cancelled) {
          setDraftApiKeyConfigured(configured);
          setCheckedApiKeyScope(scope);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDraftApiKeyConfigured(false);
          setCheckedApiKeyScope(scope);
        }
      });
    return () => { cancelled = true; };
  }, [baseUrlError, draft.llmProvider, draft.baseUrl]);

  // Refs for paste
  const apiKeyRef = useRef<HTMLInputElement>(null);

  // ── Refresh DB info ──────────────────────────────
  const refreshDbInfoStrict = useCallback(async () => {
    if (!isTauriRuntime() || degradedMode) {
      setDbInfo(null);
      return;
    }
    setDbInfo(await desktopDataGateway.getInfo());
  }, [degradedMode]);

  const refreshDbInfo = useCallback(async () => {
    try {
      await refreshDbInfoStrict();
    } catch {
      setDbInfo(null);
    }
  }, [refreshDbInfoStrict]);

  const refreshBackupsStrict = useCallback(async () => {
    if (!isTauriRuntime() || degradedMode) {
      setBackups([]);
      return;
    }
    setBackups(await desktopDataGateway.listBackups());
  }, [degradedMode]);

  const refreshBackups = useCallback(async () => {
    try {
      await refreshBackupsStrict();
    } catch {
      setBackups([]);
    }
  }, [refreshBackupsStrict]);

  // Fetch db info on mount
  useEffect(() => {
    void Promise.allSettled([refreshDbInfo(), refreshBackups()]);
  }, [refreshDbInfo, refreshBackups]);

  // Data may change while another tab is open; refresh at the point of use.
  useEffect(() => {
    if (activeTab === 'data') {
      void Promise.allSettled([refreshDbInfo(), refreshBackups()]);
    }
  }, [activeTab, refreshDbInfo, refreshBackups]);

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

  const handleClearApiKey = useCallback(async () => {
    setSaveError(null);
    try {
      await clearApiKey({ llmProvider: draft.llmProvider, baseUrl: draft.baseUrl });
      setDraft((previous) => ({ ...previous, apiKey: '' }));
      setDraftApiKeyConfigured(false);
      setCheckedApiKeyScope(draftApiKeyScope);
    } catch (error) {
      setSaveError(getErrorMessage(error, '删除 API Key 失败'));
    }
  }, [clearApiKey, draft.llmProvider, draft.baseUrl, draftApiKeyScope]);

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
              apiKeyConfigured={checkedApiKeyScope === draftApiKeyScope
                && draftApiKeyConfigured}
              baseUrlError={baseUrlError}
              showApiKey={showApiKey}
              testResult={testResult}
              apiKeyRef={apiKeyRef}
              onPresetChange={handlePresetChange}
              onShowApiKeyToggle={() => setShowApiKey((v) => !v)}
              onPasteApiKey={handlePasteApiKey}
              onClearApiKey={handleClearApiKey}
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
          {activeTab === 'localModel' && LocalModelTab && (
            <Suspense fallback={<p className="text-sm text-gray-500">正在加载实验功能...</p>}>
              <LocalModelTab
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
            </Suspense>
          )}
          {activeTab === 'data' && (
            <DataTab
              dbInfo={dbInfo}
              backups={backups}
              degradedMode={degradedMode}
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
            <AboutTab />
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
  apiKeyConfigured,
  baseUrlError,
  showApiKey,
  testResult,
  apiKeyRef,
  onPresetChange,
  onShowApiKeyToggle,
  onPasteApiKey,
  onClearApiKey,
  onUpdate,
  onUpdateNumber,
  onTestConnection,
  onPrivacyChange,
}: {
  draft: AppSettings;
  apiKeyConfigured: boolean;
  baseUrlError: string | null;
  showApiKey: boolean;
  testResult: 'idle' | 'testing' | 'success' | 'failure';
  apiKeyRef: { current: HTMLInputElement | null };
  onPresetChange: (id: string) => void;
  onShowApiKeyToggle: () => void;
  onPasteApiKey: () => void;
  onClearApiKey: () => void;
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
                placeholder={apiKeyConfigured ? '已安全保存在系统钥匙串；输入新值可替换' : 'sk-...'}
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
          {apiKeyConfigured && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-green-400">
                已配置。桌面请求由 Rust 从系统钥匙串读取，密钥不会回填到页面。
              </p>
              <button
                type="button"
                onClick={onClearApiKey}
                className="text-xs text-red-400 hover:text-red-300 shrink-0"
              >
                删除密钥
              </button>
            </div>
          )}
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
  { key: 'contextWindow', label: '模型上下文窗口 (tokens)', min: 4096, max: 1048576, step: 1024 },
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
