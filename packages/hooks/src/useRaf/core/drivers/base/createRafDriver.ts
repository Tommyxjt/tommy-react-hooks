import type { FrameCallback, FrameDriver, FrameRequestId } from '../types';
import { defaultNow, getGlobal } from './utils';

export interface CreateRafDriverOptions {
  /**
   * 指定 RAF / CAF 的实现（便于测试或跨平台注入）
   * 默认会从 globalThis 上取 requestAnimationFrame / cancelAnimationFrame
   */
  requestAnimationFrame?: (cb: FrameCallback) => number;
  cancelAnimationFrame?: (id: number) => void;

  /**
   * now() 的实现
   * 默认：performance.now()（若存在）否则 Date.now()
   */
  now?: () => number;

  /**
   * 标识（调试用，可选）
   * e.g. 'raf'
   */
  type?: string;
}

/**
 * createRafDriver
 *
 * 纯 RAF driver：
 * - 只做 RAF/CAF 桥接
 * - 不负责 fallback（fallback 由 createFrameDriver 决定）
 *
 * 返回值：
 * - 若运行环境不支持 RAF（且未注入 requestAnimationFrame），返回 undefined
 */
export function createRafDriver(options: CreateRafDriverOptions = {}): FrameDriver | undefined {
  const defaultRaf =
    typeof getGlobal('requestAnimationFrame') === 'function'
      ? (getGlobal('requestAnimationFrame') as (cb: FrameCallback) => number)
      : undefined;

  const defaultCaf =
    typeof getGlobal('cancelAnimationFrame') === 'function'
      ? (getGlobal('cancelAnimationFrame') as (id: number) => void)
      : undefined;

  const raf = options.requestAnimationFrame ?? defaultRaf;
  if (typeof raf !== 'function') return undefined;

  const caf = options.cancelAnimationFrame ?? defaultCaf;
  const now = options.now ?? defaultNow;
  const type = options.type ?? 'raf';

  const request = (cb: FrameCallback): FrameRequestId => {
    return raf(cb);
  };

  const cancel = (id: FrameRequestId) => {
    // RAF 路径：如果有 caf 就 cancel，否则 no-op
    if (caf) caf(id as number);
  };

  return {
    type,
    now,
    request,
    cancel,
  };
}

export default createRafDriver;
