/**
 * 机器可读的错误码。
 *
 * 消费方应当按 code 分支（决定弹哪种引导），而不要解析 message。
 */
export type ShizukuErrorCode =
  | 'UNSUPPORTED'
  | 'SERVICE_NOT_RUNNING'
  | 'PERMISSION_DENIED'
  | 'USER_SERVICE_NOT_BOUND'
  | 'COMMAND_FAILED'
  | 'IO_ERROR'
  | 'TIMEOUT';

export const SHIZUKU_ERROR_CODES: readonly ShizukuErrorCode[] = [
  'UNSUPPORTED',
  'SERVICE_NOT_RUNNING',
  'PERMISSION_DENIED',
  'USER_SERVICE_NOT_BOUND',
  'COMMAND_FAILED',
  'IO_ERROR',
  'TIMEOUT',
] as const;

export class ShizukuError extends Error {
  readonly code: ShizukuErrorCode;

  constructor(code: ShizukuErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ShizukuError';
    this.code = code;
    // 兼容 ES5 target 下 extends Error 丢失原型的坑
    Object.setPrototypeOf(this, ShizukuError.prototype);
  }

  static isShizukuError(value: unknown): value is ShizukuError {
    return value instanceof ShizukuError;
  }
}

/** 把原生侧 promise.reject(code, message) 抛出的对象规整为 ShizukuError */
export function toShizukuError(value: unknown): ShizukuError {
  if (value instanceof ShizukuError) return value;

  const maybe = value as { code?: unknown; message?: unknown } | null | undefined;
  const rawCode = typeof maybe?.code === 'string' ? maybe.code : undefined;
  const message = typeof maybe?.message === 'string' ? maybe.message : String(value);

  const code = SHIZUKU_ERROR_CODES.includes(rawCode as ShizukuErrorCode)
    ? (rawCode as ShizukuErrorCode)
    : 'COMMAND_FAILED';

  return new ShizukuError(code, message);
}
