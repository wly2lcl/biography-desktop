import type { StartupStatus } from '@/services/startup';

interface StartupRecoveryScreenProps {
  status: StartupStatus;
  onOpenDataFolder: () => Promise<void>;
  onContinueTemporarily: () => void;
}

export default function StartupRecoveryScreen({
  status,
  onOpenDataFolder,
  onContinueTemporarily,
}: StartupRecoveryScreenProps) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-dark-950 p-6">
      <div className="glass-panel max-w-xl w-full p-8 space-y-5">
        <div>
          <p className="text-sm text-amber-400 mb-2">启动恢复模式</p>
          <h1 className="text-2xl font-serif text-gray-100">无法打开持久化数据库</h1>
        </div>
        <p className="text-sm leading-relaxed text-gray-300">
          应用已使用临时内存数据库启动，避免直接退出。临时模式中的会话会在关闭应用后丢失。
        </p>
        <div className="rounded-lg bg-dark-900/70 border border-white/10 p-4 text-xs font-mono space-y-2">
          <p className="text-gray-400 break-all">数据目录：{status.dataDir || '未知'}</p>
          <p className="text-red-300 break-words">{status.error || '未知启动错误'}</p>
        </div>
        <p className="text-xs text-gray-500">
          建议打开数据目录，检查磁盘空间、目录权限或数据库文件后重新启动应用。
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={() => void onOpenDataFolder()}>
            打开数据目录
          </button>
          <button type="button" className="btn-secondary" onClick={onContinueTemporarily}>
            继续使用临时模式
          </button>
        </div>
      </div>
    </div>
  );
}
