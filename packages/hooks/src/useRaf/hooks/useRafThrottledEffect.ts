import { useEffect, useMemo, useRef } from 'react';
import { useStableCallback } from '../../_internal/react/useStableCallback';
import { useUnmount } from '../../_internal/react/useUnmount';
import useRafScheduler from '../core/useRafScheduler';

export interface UseRafThrottledEffectOptions {
  /**
   * 单实例限速（fps）
   * - 不传：跟随 rAF（≈显示器刷新率/浏览器调度）
   * - 传入：主动跳帧限速（例如 30fps）
   */
  maxFps?: number;

  /**
   * 是否启用（默认 true）
   * - false：run/flush/cancel 都会 no-op
   */
  enabled?: boolean;
}

export interface UseRafThrottledEffectActions {
  /** 请求下一帧（或按 maxFps）执行一次 effect（同帧多次调用会合并 takeLatest） */
  run: () => void;

  /** 若存在 pending：立刻同步执行一次 effect */
  flush: () => void;

  /** 取消尚未执行的那一帧 effect（不触发 cleanup；cleanup 只在下一次真正执行前或 unmount 时触发） */
  cancel: () => void;

  /** 是否存在尚未执行的帧任务（适合 render 使用） */
  readonly pending: boolean;
}

/**
 * useRafThrottledEffect
 *
 * 将“副作用执行”对齐到帧边界：同一帧内多次触发只执行一次（takeLatest）。
 *
 * 使用场景：scroll/resize/pointermove 等高频事件里做“读布局 + 写 DOM”
 * - 事件回调里只做：记录最新输入 + run()
 * - 真实重活放到 effect 里：每帧最多一次
 */
export default function useRafThrottledEffect(
  effect: () => undefined | (() => void),
  deps: React.DependencyList,
  options?: UseRafThrottledEffectOptions,
): UseRafThrottledEffectActions {
  const enabledRef = useRef<boolean>(options?.enabled ?? true);
  enabledRef.current = options?.enabled ?? true;

  const maxFpsRef = useRef<number | undefined>(options?.maxFps);
  maxFpsRef.current = options?.maxFps;

  const cleanupRef = useRef<null | (() => void)>(null);

  const effectStable = useStableCallback(effect);

  const runEffect = useStableCallback(() => {
    // 先清理上一次已执行过的 effect（对齐 useEffect 的“下一次执行前 cleanup”语义）
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    const ret = effectStable();
    if (typeof ret === 'function') cleanupRef.current = ret;
  });

  // 用 useRafScheduler 作为底座：takeLatest + 可选 maxFps
  const scheduler = useRafScheduler<number>(
    () => {
      runEffect();
    },
    {
      maxFps: maxFpsRef.current,
      shouldInvoke: () => enabledRef.current,
    },
  );

  const run = useStableCallback(() => {
    if (!enabledRef.current) return;
    // payload 对外无意义，固定值即可；同帧合并 takeLatest
    scheduler.schedule(1);
  });

  const flush = useStableCallback(() => {
    if (!enabledRef.current) return;
    scheduler.flush();
  });

  const cancel = useStableCallback(() => {
    if (!enabledRef.current) return;
    scheduler.cancel();
  });

  // deps 变化（或 mount）后，调度一次 effect（但真正执行会对齐到下一帧/限速）
  // 注意：这里不会“立刻 cleanup 再等待下一帧”，而是在下一次真正执行前 cleanup，避免中间空窗期。
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // unmount：取消 pending，并做最后一次 cleanup
  useUnmount(() => {
    scheduler.cancel();
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  });

  return useMemo(
    () => ({
      run,
      flush,
      cancel,
      get pending() {
        return scheduler.pending;
      },
    }),
    [cancel, flush, run, scheduler],
  );
}
