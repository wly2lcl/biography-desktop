export type AppErrorCode =
  | 'invalid_config'
  | 'authentication'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'server'
  | 'invalid_response'
  | 'cancelled'
  | 'persistence'
  | 'startup'
  | 'context_overflow'
  | 'operation_failed';

export type RetryAction = () => void | Promise<void>;

export interface AppError {
  code: AppErrorCode;
  message: string;
  diagnosticId: string;
  retryAction?: RetryAction;
}

function diagnosticId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `BIO-${Date.now().toString(36).toUpperCase()}-${random.toUpperCase()}`;
}

export function createAppError(
  code: AppErrorCode,
  message: string,
  retryAction?: RetryAction
): AppError {
  return {
    code,
    message,
    diagnosticId: diagnosticId(),
    ...(retryAction ? { retryAction } : {}),
  };
}

export function isAppError(value: unknown): value is AppError {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === 'string'
    && typeof record.message === 'string'
    && typeof record.diagnosticId === 'string';
}
