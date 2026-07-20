import { useGameStore } from '@/store/gameStore';
import { downloadDiagnosticBundle } from '@/services/diagnostics';
import { getRequestMetrics } from '@/services/requestMetrics';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200 font-mono text-xs">{value}</span>
    </div>
  );
}

export default function AboutTab() {
  const appVersion = import.meta.env.VITE_APP_VERSION || '0.1.1';
  const settings = useGameStore((state) => state.settings);
  const lastRequest = getRequestMetrics(1)[0];

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <h3 className="text-xl font-serif text-primary-300 mb-1">传记生成器</h3>
        <p className="text-gray-500 text-sm">v{appVersion}</p>
      </div>

      <div className="glass-panel !bg-dark-800/50 p-4 space-y-2">
        <InfoRow label="应用名称" value="传记生成器" />
        <InfoRow label="版本" value={appVersion} />
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

      <div className="glass-panel !bg-dark-800/50 p-4 space-y-2">
        <h4 className="text-sm font-medium text-gray-200">本地请求摘要</h4>
        {lastRequest ? (
          <>
            <InfoRow label="最近模型" value={`${lastRequest.provider} / ${lastRequest.model}`} />
            <InfoRow label="耗时" value={`${lastRequest.durationMs} ms`} />
            <InfoRow
              label="Token 估算"
              value={`${lastRequest.inputTokensEstimate} 输入 / ${lastRequest.outputTokensEstimate} 输出`}
            />
            <InfoRow label="结果" value={lastRequest.status === 'success' ? '成功' : '失败'} />
          </>
        ) : (
          <p className="text-xs text-gray-500">尚无请求记录。这些摘要只保存在本机，不包含剧情正文。</p>
        )}
        <button
          type="button"
          onClick={() => downloadDiagnosticBundle(settings)}
          className="btn-secondary text-sm mt-2"
        >
          导出隐私脱敏诊断包
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <a
          href="https://github.com/wly2lcl/biography-desktop"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
        >
          GitHub
        </a>
        <a
          href="https://github.com/wly2lcl/biography-desktop/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
        >
          检查新版本
        </a>
      </div>
    </div>
  );
}
