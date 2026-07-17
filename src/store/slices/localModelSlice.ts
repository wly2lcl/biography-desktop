import type { AppSettings } from '@/types/settings';
import type { DownloadedModel, ModelInfo, ServerStatus } from '@/types/models';
import type { AppError } from '@/types/errors';

export interface LocalModelSlice {
  serverStatus: ServerStatus | null;
  availableModels: ModelInfo[];
  downloadedModels: DownloadedModel[];
  downloadingModel: string | null;
  downloadProgress: number;
  refreshServerStatus(): Promise<void>;
  refreshAvailableModels(): Promise<void>;
  refreshDownloadedModels(): Promise<void>;
  startLocalServer(modelPath: string, gpuLayers?: number, contextSize?: number): Promise<void>;
  stopLocalServer(): Promise<void>;
  startDownloadModel(modelId: string): Promise<void>;
  cancelDownloadModel(): Promise<void>;
  deleteDownloadedModel(modelId: string): Promise<void>;
  ensureBinary(): Promise<string>;
}

interface LocalModelHost extends LocalModelSlice {
  isLoading: boolean;
  loadingText: string;
  error: AppError | null;
  updateSettings(updates: Partial<AppSettings>): Promise<void>;
}

type ErrorFactory = (
  error: unknown,
  fallback: string,
  retryAction?: () => void | Promise<void>
) => AppError;

export function createLocalModelSlice<T extends LocalModelHost>(
  set: (partial: Partial<T>) => void,
  get: () => T,
  toError: ErrorFactory
): LocalModelSlice {
  return {
    serverStatus: null,
    availableModels: [],
    downloadedModels: [],
    downloadingModel: null,
    downloadProgress: 0,

    async refreshServerStatus() {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        set({ serverStatus: await invoke<ServerStatus>('get_server_status') } as Partial<T>);
      } catch {
        set({
          serverStatus: {
            is_running: false,
            pid: null,
            port: null,
            model_name: null,
            context_size: null,
            gpu_layers: null,
          },
        } as Partial<T>);
      }
    },

    async refreshAvailableModels() {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        set({ availableModels: await invoke<ModelInfo[]>('list_available_models') } as Partial<T>);
      } catch (error) {
        console.error('Failed to load available models:', error);
      }
    },

    async refreshDownloadedModels() {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        set({ downloadedModels: await invoke<DownloadedModel[]>('list_downloaded_models') } as Partial<T>);
      } catch (error) {
        console.error('Failed to load downloaded models:', error);
      }
    },

    async startLocalServer(modelPath, gpuLayers, contextSize) {
      set({ isLoading: true, loadingText: '正在启动本地模型服务...' } as Partial<T>);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<{ port: number; model_name: string }>('start_server', {
          modelPath,
          gpuLayers: gpuLayers ?? 0,
          contextSize: contextSize ?? 4096,
        });
        await get().updateSettings({
          llmProvider: 'llamacpp_local',
          baseUrl: `http://127.0.0.1:${info.port}`,
          model: info.model_name.replace(/\.gguf$/, ''),
          apiKey: '',
          timeout: 300000,
        });
        await get().refreshServerStatus();
        set({ isLoading: false, loadingText: '' } as Partial<T>);
      } catch (error) {
        set({
          error: toError(error, '启动本地模型服务失败', () => (
            get().startLocalServer(modelPath, gpuLayers, contextSize)
          )),
          isLoading: false,
          loadingText: '',
        } as Partial<T>);
      }
    },

    async stopLocalServer() {
      set({ isLoading: true, loadingText: '正在停止服务...' } as Partial<T>);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('stop_server');
        set({ serverStatus: null, isLoading: false, loadingText: '' } as Partial<T>);
      } catch (error) {
        set({
          error: toError(error, '停止服务失败', () => get().stopLocalServer()),
          isLoading: false,
          loadingText: '',
        } as Partial<T>);
      }
    },

    async startDownloadModel(modelId) {
      set({ downloadingModel: modelId, downloadProgress: 0 } as Partial<T>);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');
        const unlistenProgress = await listen<{ model_id: string; progress: number }>(
          'model_download_progress',
          (event) => {
            if (event.payload.model_id === modelId) {
              set({ downloadProgress: event.payload.progress } as Partial<T>);
            }
          }
        );
        const unlistenComplete = await listen<{
          model_id: string;
          success: boolean;
          error?: string;
        }>('model_download_complete', async (event) => {
          await unlistenProgress();
          await unlistenComplete();
          if (event.payload.success) {
            set({ downloadingModel: null, downloadProgress: 0 } as Partial<T>);
            await get().refreshDownloadedModels();
          } else {
            set({
              downloadingModel: null,
              downloadProgress: 0,
              error: toError(
                new Error(event.payload.error ?? '下载失败'),
                '下载模型失败',
                () => get().startDownloadModel(modelId)
              ),
            } as Partial<T>);
          }
        });
        await invoke('download_model', { modelId });
      } catch (error) {
        set({
          downloadingModel: null,
          downloadProgress: 0,
          error: toError(error, '下载模型失败', () => get().startDownloadModel(modelId)),
        } as Partial<T>);
      }
    },

    async cancelDownloadModel() {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('cancel_download');
        set({ downloadingModel: null, downloadProgress: 0 } as Partial<T>);
      } catch (error) {
        console.error('Failed to cancel download:', error);
      }
    },

    async deleteDownloadedModel(modelId) {
      set({ isLoading: true, loadingText: '正在删除模型...' } as Partial<T>);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_model', { modelId });
        await get().refreshDownloadedModels();
        set({ isLoading: false, loadingText: '' } as Partial<T>);
      } catch (error) {
        set({
          error: toError(error, '删除模型失败', () => get().deleteDownloadedModel(modelId)),
          isLoading: false,
          loadingText: '',
        } as Partial<T>);
      }
    },

    async ensureBinary() {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke<string>('ensure_binary');
    },
  };
}
