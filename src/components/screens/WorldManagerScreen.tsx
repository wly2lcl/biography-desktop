import { useState, useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import ConfirmModal from '@/components/common/ConfirmModal';
import { getWorldContext, isTauri } from '@/services/world';
import { getErrorMessage } from '@/utils/errors';

/* ──────────────────────────────────────────────────────────
   Local types — extend store WorldInfo with metadata needed
   for the management UI.
   ────────────────────────────────────────────────────────── */

interface WorldEntry {
  name: string;
  filename: string;
  description: string;
  isBuiltIn: boolean;
  type: 'single' | 'directory';
  fileSize: number;
  fileCount: number;
}

interface WorldFormData {
  name: string;
  content: string;
}

type ModalMode = 'closed' | 'new' | 'edit';

/**
 * World management overlay — browse, create, edit, import,
 * export, and delete world definitions.
 */
export default function WorldManagerScreen() {
  const { worlds, session, loadWorlds, setShowWorldManager } = useGameStore();

  const [entries, setEntries] = useState<WorldEntry[]>([]);
  const [builtInEntries, setBuiltInEntries] = useState<WorldEntry[]>([]);
  const [userEntries, setUserEntries] = useState<WorldEntry[]>([]);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [editingEntry, setEditingEntry] = useState<WorldEntry | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<WorldEntry | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rebuild lists whenever worlds changes
  useEffect(() => {
    const mapped: WorldEntry[] = worlds.map((w) => ({
      name: w.name,
      filename: w.filename,
      description: w.description,
      isBuiltIn: w.isBuiltIn,
      type: w.type,
      fileSize: 0,
      fileCount: w.type === 'single' ? 1 : 0,
    }));
    setEntries(mapped);
  }, [worlds]);

  // Separate built-in and user worlds
  useEffect(() => {
    setBuiltInEntries(entries.filter((e) => e.isBuiltIn));
    setUserEntries(entries.filter((e) => !e.isBuiltIn));
  }, [entries]);

  // Load worlds on mount
  useEffect(() => {
    loadWorlds();
  }, [loadWorlds]);

  // ── Close on Escape ───────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowWorldManager(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setShowWorldManager]);

  // ── Preview world ──────────────────────────────────
  const handlePreview = useCallback(async (entry: WorldEntry) => {
    try {
      const content = await getWorldContext({
        name: entry.filename,
        source: entry.isBuiltIn ? 'builtin' : 'user',
        type: entry.type,
      });
      setPreviewName(entry.name);
      setPreviewContent(content || '(空)');
      return;
    } catch {
      // fallthrough
    }
    setPreviewName(entry.name);
    setPreviewContent('(无法加载世界内容)');
  }, []);

  const handleEdit = useCallback(async (entry: WorldEntry) => {
    if (entry.isBuiltIn || entry.type !== 'single') return;
    try {
      const content = await getWorldContext({
        name: entry.filename,
        source: 'user',
        type: 'single',
      });
      setEditingEntry(entry);
      setEditingContent(content);
      setPreviewContent(null);
      setModalMode('edit');
    } catch (err) {
      console.error('Failed to load world for editing:', err);
      alert(`加载失败，未进入编辑模式: ${getErrorMessage(err, '未知错误')}`);
    }
  }, []);

  // ── New / Edit save ────────────────────────────────
  const handleSaveWorld = useCallback(
    async (data: WorldFormData) => {
      try {
        const existingFilename = editingEntry?.filename;
        if (isTauri()) {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('save_world', {
            world_name: existingFilename?.replace(/\.md$/i, '') ?? data.name.replace(/\.md$/i, ''),
            content: data.content,
          });
        } else {
          // Web mode: save to localStorage
          const filename = existingFilename ?? `${data.name.replace(/\.md$/i, '')}.md`;
          localStorage.setItem(`bio_world_${filename}`, data.content);
          const existing = JSON.parse(localStorage.getItem('bio_user_worlds') || '[]');
          if (!existing.includes(filename)) {
            existing.push(filename);
            localStorage.setItem('bio_user_worlds', JSON.stringify(existing));
          }
        }
        await loadWorlds();
        setModalMode('closed');
        setEditingEntry(null);
        setEditingContent('');
      } catch (err) {
        console.error('Failed to save world:', err);
        alert(`保存失败: ${getErrorMessage(err, '未知错误')}`);
      }
    },
    [editingEntry, loadWorlds],
  );

  // ── Export world ───────────────────────────────────
  const handleExport = useCallback(async (entry: WorldEntry) => {
    try {
      let content: string;
      if (entry.isBuiltIn) {
        content = await getWorldContext({
          name: entry.filename,
          source: 'builtin',
          type: entry.type,
        });
      } else if (!isTauri()) {
        content = localStorage.getItem(`bio_world_${entry.filename}`) || '';
      } else {
        const { invoke } = await import('@tauri-apps/api/core');
        content = (await invoke('export_world', {
          world_name: entry.filename,
        })) as string;
      }

      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = entry.type === 'directory' ? `${entry.filename}.md` : entry.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export world:', err);
      alert(`导出失败: ${getErrorMessage(err, '未知错误')}`);
    }
  }, []);

  // ── Delete world ───────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!showDeleteConfirm) return;
    if (session?.isActive && session.worldRef.source === 'user'
      && session.worldRef.name === showDeleteConfirm.filename) {
      alert('当前会话仍在使用这个世界，请先结束并离开该会话。');
      setShowDeleteConfirm(null);
      return;
    }
    try {
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_world', { world_name: showDeleteConfirm.filename });
      } else {
        localStorage.removeItem(`bio_world_${showDeleteConfirm.filename}`);
        const existing = JSON.parse(localStorage.getItem('bio_user_worlds') || '[]');
        localStorage.setItem('bio_user_worlds', JSON.stringify(existing.filter((f: string) => f !== showDeleteConfirm.filename)));
      }
      await loadWorlds();
      setSelectedFilenames((selected) => {
        const next = new Set(selected);
        next.delete(showDeleteConfirm.filename);
        return next;
      });
      setShowDeleteConfirm(null);
    } catch (e) {
      console.error('Failed to delete world:', e);
      alert(`删除失败: ${getErrorMessage(e, '未知错误')}`);
    }
  }, [showDeleteConfirm, session, loadWorlds]);

  // ── Import world from file ─────────────────────────
  const handleImport = useCallback(async () => {
    // Always use browser file input (works in both web and Tauri)
    fileInputRef.current?.click();
  }, []);

  // Handle browser file input
  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const filename = file.name;

        if (isTauri()) {
          // Tauri mode: save via IPC
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('save_world', {
            world_name: filename.replace(/\.md$/i, ''),
            content,
          });
        } else {
          // Web mode: save to localStorage
          const key = `bio_world_${filename}`;
          localStorage.setItem(key, content);
          // Also update world list in localStorage
          const existing = JSON.parse(localStorage.getItem('bio_user_worlds') || '[]');
          if (!existing.includes(filename)) {
            existing.push(filename);
            localStorage.setItem('bio_user_worlds', JSON.stringify(existing));
          }
        }
        await loadWorlds();
      } catch (err) {
        console.error('Failed to import world:', err);
        alert(`导入失败: ${getErrorMessage(err, '未知错误')}`);
      }

      // Reset input
      e.target.value = '';
    },
    [loadWorlds],
  );

  // ── Selection toggle for batch export ───────────
  const toggleSelection = useCallback((filename: string) => {
    setSelectedFilenames((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  }, []);

  const isAllSelected = userEntries.length > 0 && userEntries.every((e) => selectedFilenames.has(e.filename));

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedFilenames(new Set());
    } else {
      setSelectedFilenames(new Set(userEntries.map((e) => e.filename)));
    }
  }, [userEntries, isAllSelected]);

  // ── Batch export ─────────────────────────────────
  const handleBatchExport = useCallback(async () => {
    const selected = userEntries.filter((e) => selectedFilenames.has(e.filename));
    if (selected.length === 0) return;

    try {
      let worldData: Record<string, string> = {};

      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = (await invoke('export_worlds', {
          filenames: selected.map((e) => e.filename),
        })) as string;
        worldData = JSON.parse(result);
      } else {
        // Web mode: collect from localStorage
        for (const entry of selected) {
          const content = localStorage.getItem(`bio_world_${entry.filename}`);
          if (content) {
            worldData[entry.filename] = content;
          }
        }
      }

      const json = JSON.stringify(worldData, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'worlds_export.json';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to batch export worlds:', err);
      alert(`批量导出失败: ${getErrorMessage(err, '未知错误')}`);
    }
  }, [userEntries, selectedFilenames]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/90 backdrop-blur-sm animate-fade-in">
      {/* Panel */}
      <div className="glass-panel w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col animate-slide-up">
        {/* ── Header ──────────────────────────────── */}
        <div className="shrink-0 relative px-6 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-100">世界观管理</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingEntry(null);
                  setEditingContent('');
                  setModalMode('new');
                }}
                className="btn-primary text-sm"
              >
                + 新建
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="btn-secondary text-sm"
              >
                📥 导入
              </button>
              {selectedFilenames.size > 0 && (
                <button
                  type="button"
                  onClick={handleBatchExport}
                  className="btn-secondary text-sm"
                >
                  批量导出 ({selectedFilenames.size})
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowWorldManager(false)}
                className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors rounded-lg hover:bg-dark-800 ml-1"
                aria-label="关闭"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Built-in worlds */}
          <section>
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
              内置世界
            </h3>
            {builtInEntries.length === 0 ? (
              <p className="text-gray-600 text-sm">暂无内置世界</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {builtInEntries.map((entry) => (
                  <WorldCard
                    key={entry.filename}
                    entry={entry}
                    onPreview={() => handlePreview(entry)}
                    onEdit={null}
                    onExport={null}
                    onDelete={null}
                  />
                ))}
              </div>
            )}
          </section>

          {/* User worlds */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                用户世界
              </h3>
              {userEntries.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-600 bg-dark-800 text-primary-500 focus:ring-primary-500/50"
                  />
                  全选
                </label>
              )}
            </div>
            {userEntries.length === 0 ? (
              <div className="glass-panel !bg-dark-800/30 p-6 text-center">
                <p className="text-gray-500 text-sm">暂无用户世界，点击「+ 新建」或「📥 导入」添加</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {userEntries.map((entry) => (
                  <WorldCard
                    key={entry.filename}
                    entry={entry}
                    selected={selectedFilenames.has(entry.filename)}
                    onToggleSelect={() => toggleSelection(entry.filename)}
                    onPreview={() => handlePreview(entry)}
                    onEdit={entry.type === 'single' ? () => handleEdit(entry) : null}
                    onExport={() => handleExport(entry)}
                    onDelete={() => setShowDeleteConfirm(entry)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Hidden file input for import fallback ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* ── New / Edit world modal ────────────────── */}
      {modalMode !== 'closed' && (
        <WorldFormModal
          mode={modalMode}
          initial={modalMode === 'edit' && editingEntry ? {
            name: editingEntry.filename.replace(/\.md$/i, ''),
            content: editingContent,
          } : undefined}
          onSave={handleSaveWorld}
          onClose={() => {
            setModalMode('closed');
            setEditingEntry(null);
            setEditingContent('');
          }}
        />
      )}

      {/* ── Preview modal ─────────────────────────── */}
      {previewContent !== null && (
        <WorldPreviewModal
          name={previewName}
          content={previewContent}
          onClose={() => {
            setPreviewContent(null);
            setPreviewName('');
          }}
        />
      )}

      {/* ── Delete confirmation ───────────────────── */}
      {showDeleteConfirm && (
        <ConfirmModal
          title="删除世界"
          message={`确定要删除「${showDeleteConfirm.name}」吗？此操作不可撤销，依赖它的历史会话将无法继续或重新生成传记。`}
          confirmText="删除"
          cancelText="取消"
          danger
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   World Card
   ══════════════════════════════════════════════════════════ */

function WorldCard({
  entry,
  selected,
  onToggleSelect,
  onPreview,
  onEdit,
  onExport,
  onDelete,
}: {
  entry: WorldEntry;
  selected?: boolean;
  onToggleSelect?: () => void;
  onPreview: () => void;
  onEdit: (() => void) | null;
  onExport: (() => void) | null;
  onDelete: (() => void) | null;
}) {
  return (
    <div className="card-base animate-slide-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={!!selected}
                onChange={onToggleSelect}
                className="rounded border-gray-600 bg-dark-800 text-primary-500 focus:ring-primary-500/50 shrink-0"
              />
            )}
            <h4 className="text-gray-100 font-medium truncate">{entry.name}</h4>
          </div>
          {entry.description && (
            <p className="text-gray-500 text-xs mt-1 line-clamp-2 leading-relaxed">
              {entry.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
            <span>{entry.type === 'single' ? '单个文件' : '目录'}</span>
            {entry.fileSize > 0 && (
              <>
                <span>·</span>
                <span>{formatFileSize(entry.fileSize)}</span>
              </>
            )}
            {entry.fileCount > 1 && (
              <>
                <span>·</span>
                <span>{entry.fileCount} 文件</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
        <button
          type="button"
          onClick={onPreview}
          className="btn-secondary text-xs py-1 px-2.5"
        >
          预览
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="btn-secondary text-xs py-1 px-2.5"
          >
            编辑
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="btn-secondary text-xs py-1 px-2.5"
          >
            导出
          </button>
        )}
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="btn-danger text-xs py-1 px-2.5 ml-auto"
          >
            删除
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="btn-danger text-xs py-1 px-2.5 ml-auto opacity-40 cursor-not-allowed"
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   World Form Modal (new / edit)
   ══════════════════════════════════════════════════════════ */

function WorldFormModal({
  mode,
  initial,
  onSave,
  onClose,
}: {
  mode: 'new' | 'edit';
  initial?: { name: string; content: string };
  onSave: (data: WorldFormData) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      setSaving(true);
      try {
        await onSave({ name: name.trim(), content });
      } finally {
        setSaving(false);
      }
    },
    [name, content, onSave],
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-950/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto animate-slide-up p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-5">
          {mode === 'new' ? '新建世界' : '编辑世界'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="world-form-name" className="block text-sm text-gray-300 mb-1.5 font-medium">
              名称
            </label>
            <input
              id="world-form-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mode === 'edit'}
              placeholder="世界名称"
              required
              className="input-base"
            />
          </div>

          {/* Content (markdown) */}
          <div>
            <label htmlFor="world-form-content" className="block text-sm text-gray-300 mb-1.5 font-medium">
              内容 (Markdown)
            </label>
            <textarea
              id="world-form-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# 世界设定

## 地理
..."
              rows={12}
              className="input-base resize-none font-mono text-sm leading-relaxed"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn-secondary text-sm"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="btn-primary text-sm"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   World Preview Modal
   ══════════════════════════════════════════════════════════ */

function WorldPreviewModal({
  name,
  content,
  onClose,
}: {
  name: string;
  content: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-950/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col animate-slide-up">
        <div className="shrink-0 flex items-center justify-between px-6 pt-5 pb-3 border-b border-white/10">
          <h3 className="text-base font-medium text-gray-100 truncate">{name}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="关闭预览"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <pre className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-mono">
            {content}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════ */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
