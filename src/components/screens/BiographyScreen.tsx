import { useGameStore } from '@/store/gameStore';
import StreamedText from '@/components/common/StreamedText';
import { t } from '@/i18n';
import {
  downloadBiography,
  printBiographyAsPdf,
} from '@/services/biographyExport';

export default function BiographyScreen() {
  const {
    session,
    isStreaming,
    streamedText,
    newGame,
    setShowSettings,
    setShowWorldManager,
    settings,
    setError,
  } = useGameStore();

  // ── Guard ──────────────────────────────────────────
  if (!session) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-dark-950">
        <div className="text-center animate-fade-in">
          <div className="w-8 h-8 border-2 border-primary-500/40 border-t-primary-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  const title = session.player.name ? `【${session.player.name}传奇】` : '';
  const hasContent = !!session.biography || streamedText.length > 0;

  // ── Download handler ───────────────────────────────
  const handleDownload = (format: 'txt' | 'md') => {
    const content = session.biography || streamedText;
    if (!content) return;
    downloadBiography(session, content, settings, format);
  };

  const handlePdf = () => {
    const content = session.biography || streamedText;
    if (!content) return;
    if (!printBiographyAsPdf(session, content, settings)) {
      setError('浏览器阻止了打印窗口，请允许弹出窗口后重试');
    }
  };

  return (
    <div className="w-full h-full flex items-start justify-center bg-dark-950 overflow-y-auto py-8">
      <div className="w-full max-w-4xl mx-4 animate-fade-in">
        {/* ── Header with global buttons ────────────── */}
        <div className="flex items-center justify-end gap-2 mb-4 shrink-0">
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
        </div>

        {/* ── Title ─────────────────────────────────── */}
        {(session.biography || isStreaming) && (
          <div className="text-center mb-6 shrink-0">
            <h1 className="text-3xl font-serif text-primary-300 tracking-wide">
              {title}
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              {session.world} · {session.player.name}
            </p>
          </div>
        )}

        {/* ── Biography content ─────────────────────── */}
        <div className="glass-panel p-6 sm:p-8 mb-6">
          {!hasContent && !isStreaming ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-base">暂无传记内容</p>
              <p className="text-gray-600 text-sm mt-2">
                请先生成传记
              </p>
            </div>
          ) : isStreaming ? (
            /* Streaming state: show raw text with cursor */
            <StreamedText text={streamedText} isStreaming />
          ) : session.biography ? (
            /* Completed: render markdown as prose */
            <StreamedText text={session.biography} isStreaming={false} />
          ) : (
            /* Edge case: text present but not in biography yet */
            <StreamedText text={streamedText} isStreaming={false} />
          )}
        </div>

        {/* ── Action buttons ────────────────────────── */}
        <div className="flex justify-center gap-4 shrink-0 pb-4">
          <button
            type="button"
            onClick={() => handleDownload('txt')}
            disabled={!hasContent}
            className="btn-primary min-w-[130px] text-sm"
          >
            {t('screens.biography.download')} TXT
          </button>
          <button
            type="button"
            onClick={() => handleDownload('md')}
            disabled={!hasContent}
            className="btn-secondary min-w-[130px] text-sm"
          >
            下载 Markdown
          </button>
          <button
            type="button"
            onClick={handlePdf}
            disabled={!hasContent}
            className="btn-secondary min-w-[130px] text-sm"
          >
            打印 / PDF
          </button>
          {!isStreaming && (
            <button
              type="button"
              onClick={() => useGameStore.getState().generateBiography()}
              className="btn-secondary min-w-[130px] text-sm"
              title="传记被截断时可点击重新生成"
            >
              重新生成
            </button>
          )}
          <button
            type="button"
            onClick={newGame}
            className="btn-secondary min-w-[130px] text-sm"
          >
            {t('screens.biography.newJourney')}
          </button>
        </div>
      </div>
    </div>
  );
}
