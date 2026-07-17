import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DownloadedModel, ModelInfo, ServerStatus } from '@/types/models';

interface Props {
  serverStatus: ServerStatus | null;
  availableModels: ModelInfo[];
  downloadedModels: DownloadedModel[];
  downloadingModel: string | null;
  downloadProgress: number;
  onStartServer(modelPath: string, gpuLayers?: number, contextSize?: number): Promise<void>;
  onStopServer(): Promise<void>;
  onStartDownload(modelId: string): Promise<void>;
  onCancelDownload(): Promise<void>;
  onDeleteModel(modelId: string): Promise<void>;
  onEnsureBinary(): Promise<string>;
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LocalModelTab({
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
}: Props) {
  const [gpuLayers, setGpuLayers] = useState(0);
  const [binaryReady, setBinaryReady] = useState(false);
  const [checkingBinary, setCheckingBinary] = useState(false);
  const startingModel = useRef<string | null>(null);
  const downloadedIds = useMemo(
    () => new Set(downloadedModels.map((model) => model.id)),
    [downloadedModels]
  );
  const checkBinary = useCallback(async () => {
    setCheckingBinary(true);
    try {
      await onEnsureBinary();
      setBinaryReady(true);
    } catch {
      setBinaryReady(false);
    } finally {
      setCheckingBinary(false);
    }
  }, [onEnsureBinary]);

  useEffect(() => { void checkBinary(); }, [checkBinary]);
  const running = serverStatus?.is_running ?? false;

  return (
    <div className="space-y-5" data-module="BIOGRAPHY_EXPERIMENTAL_LOCAL_MODEL_UI">
      <div className="glass-panel !bg-dark-800/50 p-4 space-y-2">
        <h3 className="text-sm font-medium text-gray-200">服务器状态</h3>
        <p className={running ? 'text-sm text-green-400' : 'text-sm text-gray-500'}>
          {running ? '运行中' : '服务未运行'}
        </p>
        {serverStatus?.port != null && (
          <p className="text-xs font-mono text-gray-400">http://127.0.0.1:{serverStatus.port}</p>
        )}
        {running ? (
          <button type="button" className="btn-danger text-sm" onClick={() => void onStopServer()}>
            停止服务
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={checkingBinary}
            onClick={() => void checkBinary()}
          >
            {checkingBinary ? '检查中...' : binaryReady ? '二进制已就绪' : '检查二进制'}
          </button>
        )}
      </div>

      <div>
        <label htmlFor="local-model-gpu-layers" className="text-sm text-gray-300">
          GPU 加速层数：{gpuLayers}
        </label>
        <input
          id="local-model-gpu-layers"
          type="range"
          min={0}
          max={999}
          value={gpuLayers}
          onChange={(event) => setGpuLayers(Number(event.target.value))}
          className="w-full accent-primary-500"
        />
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-gray-200">已下载模型</h3>
        {downloadedModels.length === 0 && <p className="text-sm text-gray-500">暂无已下载模型</p>}
        {downloadedModels.map((model) => (
          <div key={model.id} className="glass-panel !bg-dark-800/50 p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200 truncate">{model.name}</p>
              <p className="text-xs text-gray-500">{fileSize(model.file_size)}</p>
            </div>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={running}
              onClick={() => {
                startingModel.current = model.file_path;
                void onStartServer(model.file_path, gpuLayers).finally(() => {
                  startingModel.current = null;
                });
              }}
            >
              {startingModel.current === model.file_path ? '启动中...' : '启动'}
            </button>
            <button type="button" className="btn-danger text-xs" onClick={() => void onDeleteModel(model.id)}>
              删除
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-gray-200">可用模型</h3>
        {availableModels.filter((model) => !downloadedIds.has(model.id)).map((model) => (
          <div key={model.id} className="glass-panel !bg-dark-800/50 p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200 truncate">{model.name}</p>
              <p className="text-xs text-gray-500">{model.size_gb}GB · {model.quantization}</p>
            </div>
            {downloadingModel === model.id ? (
              <>
                <span className="text-xs text-gray-400">{Math.round(downloadProgress)}%</span>
                <button type="button" className="btn-danger text-xs" onClick={() => void onCancelDownload()}>
                  取消
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary text-xs" onClick={() => void onStartDownload(model.id)}>
                下载
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
