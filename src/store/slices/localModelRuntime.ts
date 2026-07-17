import type { AppError } from '@/types/errors';
import type { LocalModelSlice } from './localModelSlice';

export type { LocalModelSlice } from './localModelSlice';

type ErrorFactory = (
  error: unknown,
  fallback: string,
  retryAction?: () => void | Promise<void>
) => AppError;

async function unavailable(): Promise<never> {
  throw new Error('本地模型仅在实验构建中可用');
}

export function createLocalModelSlice<T extends LocalModelSlice>(
  _set: (partial: Partial<T>) => void,
  _get: () => T,
  _toError: ErrorFactory
): LocalModelSlice {
  return {
    serverStatus: null,
    availableModels: [],
    downloadedModels: [],
    downloadingModel: null,
    downloadProgress: 0,
    async refreshServerStatus() {},
    async refreshAvailableModels() {},
    async refreshDownloadedModels() {},
    startLocalServer: unavailable,
    stopLocalServer: unavailable,
    startDownloadModel: unavailable,
    cancelDownloadModel: unavailable,
    deleteDownloadedModel: unavailable,
    ensureBinary: unavailable,
  };
}
