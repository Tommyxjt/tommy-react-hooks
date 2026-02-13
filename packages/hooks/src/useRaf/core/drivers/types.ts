export type TimeoutHandle = number | ReturnType<typeof globalThis.setTimeout>;

/**
 * createTimeoutDriver 返回 number，
 * requestAnimationFrame 返回的也是 number，
 * 但是 fallback=none 时，返回的「无效请求标识符 ID」是 null
 * （requestAnimationFrame 官方文档特意标注避免使用 0 作为无效请求标识符 ID 的哨兵值）
 */
export type FrameRequestId = number | null;

export type FrameCallback = (frameTime: number) => void;

export interface FrameDriver {
  /**
   * 请求“下一帧”执行一次回调。
   * - Web driver: requestAnimationFrame(cb)
   * - Shared hub driver: register cb into hub, ensure only one RAF tick per frame
   * - Fallback driver: setTimeout(() => cb(now()), delay)
   */
  request: (cb: FrameCallback) => FrameRequestId;

  /**
   * 取消一次已 request 但尚未执行的回调。
   */
  cancel: (id: FrameRequestId) => void;

  /**
   * 获取当前时间戳（用于 meta.at / 逻辑时间线；不一定等于 frameTime）
   */
  now: () => number;

  /**
   * 标识（调试用，可选）
   * e.g. 'raf' | 'timeout' | 'shared-raf'
   */
  readonly type?: string;
}
