/**
 * Shizuku 服务状态。
 *
 * - `unsupported`   非 Android 平台 / SDK < 24 / Shizuku 版本过旧（pre-v11）
 * - `not-installed` 未安装 Shizuku App（moe.shizuku.privileged.api）
 * - `not-running`   已安装但 Shizuku 服务未启动（binder 不通）
 * - `no-permission` 服务在运行，但本 App 尚未获得授权
 * - `ready`         一切就绪，可以调用需要提权的接口
 */
export type ShizukuStatus =
  | 'unsupported'
  | 'not-installed'
  | 'not-running'
  | 'no-permission'
  | 'ready';

/** 命令执行结果 */
export type ShellResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type DirEntryType = 'file' | 'directory' | 'other';

/** 目录项 */
export type DirEntry = {
  name: string;
  path: string;
  type: DirEntryType;
  size: number;
  mtimeMs: number;
};

export type ShellOptions = {
  /** 超时（毫秒），超时后抛 ShizukuError('TIMEOUT') */
  timeoutMs?: number;
  /** 工作目录 */
  cwd?: string;
};

export type CopyOptions = {
  /** 只复制文件名匹配该正则的条目 */
  nameFilter?: string;
  /** 目标已存在时是否覆盖，默认 true */
  overwrite?: boolean;
};

export type CopyResult = {
  files: number;
  bytes: number;
};

export type ShizukuInfo = {
  versionName: string;
  apiVersion: number;
};

/** addStatusListener 返回的订阅句柄 */
export type StatusSubscription = {
  remove(): void;
};
