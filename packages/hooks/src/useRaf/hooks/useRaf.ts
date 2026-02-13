import { useMemo } from 'react';
import { useStableCallback } from '../../_internal/react/useStableCallback';
import useRafScheduler from '../core/useRafScheduler';

export interface UseRafOptions {
  /**
   * 单实例限速（可选）
   * - 例如 6：约 6fps
   * - 默认不限制：每次触发都会在“下一帧”执行一次（同帧内 takeLatest 合并）
   */
  maxFps?: number;
}

export type UseRafReturn<Args extends any[]> = ((...args: Args) => void) & {
  /** 立刻同步执行一次（若存在 pending） */
  flush: () => void;
  /** 撤销下一帧执行并清空 pending */
  cancel: () => void;
  /** 释放资源（语义化的 cancel） */
  dispose: () => void;

  /** 是否存在尚未执行的帧任务（渲染用） */
  readonly pending: boolean;
  /** 获取「当前」是否存在尚未执行的帧任务（函数式读取） */
  isPending: () => boolean;
};

/**
 * useRaf（takeLatest）
 *
 * 将同一帧内的多次调用合并为“下一帧执行一次”，默认 takeLatest（最后一次参数生效）。
 * 可选 maxFps：单实例限速（仍是 takeLatest）。
 */
function useRaf<Args extends any[]>(
  invoke: (...args: Args) => void,
  options?: UseRafOptions,
): UseRafReturn<Args> {
  const invokeStable = useStableCallback(invoke);

  const scheduler = useRafScheduler<Args>(
    (args: Args) => {
      invokeStable(...args);
    },
    {
      maxFps: options?.maxFps,
    },
  );

  const raf = useMemo(() => {
    const fn = ((...args: Args) => {
      scheduler.schedule(args);
    }) as UseRafReturn<Args>;

    fn.flush = scheduler.flush;
    fn.cancel = scheduler.cancel;
    fn.dispose = scheduler.dispose;
    fn.isPending = scheduler.isPending;

    Object.defineProperty(fn, 'pending', {
      get: () => scheduler.pending,
      enumerable: true,
    });

    return fn;
  }, [scheduler]);

  return raf;
}

export default useRaf;
