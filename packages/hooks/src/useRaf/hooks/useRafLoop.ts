import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '../../_internal/react/useLatestRef';
import { useStableCallback } from '../../_internal/react/useStableCallback';
import { useUnmount } from '../../_internal/react/useUnmount';
import useRafScheduler from '../core/useRafScheduler';

export type UseRafLoopCallback = (delta: number, time: number) => void;

export interface UseRafLoopOptions {
  /**
   * 是否自动启动（仅首次生效）
   * @default true
   */
  autoStart?: boolean;
}

export interface UseRafLoopActions {
  start: () => void;
  stop: () => void;
  toggle: () => void;

  /** 渲染用：是否正在运行 */
  readonly running: boolean;
  /** 函数式读取：避免闭包误用 */
  isRunning: () => boolean;
}

/**
 * useRafLoop
 *
 * 连续帧循环（raf-like loop）：每帧执行一次回调，并提供 delta/time。
 * - 不暴露 driver：需要自定义 driver 请用 useRafScheduler 自己搭
 * - 默认 autoStart=true（仅首次生效）
 */
export default function useRafLoop(
  callback: UseRafLoopCallback,
  options?: UseRafLoopOptions,
): UseRafLoopActions {
  const autoStart = options?.autoStart ?? true;

  const cbStable = useStableCallback(callback);

  const [runningState, setRunningState] = useState(autoStart);
  const runningRef = useLatestRef(runningState);

  // 上一帧执行时刻（基于 scheduler.meta.at）
  const lastAtRef = useRef<number | null>(null);

  // scheduler actions：用 ref 存一下，避免在回调里闭包引用旧对象
  const schedulerRef = useRef<ReturnType<typeof useRafScheduler<number>> | null>(null);

  const scheduler = useRafScheduler<number>((_payload, meta) => {
    // 若已 stop，则不继续重挂
    if (!runningRef.current) return;

    const now = meta.at;
    const last = lastAtRef.current;
    const delta = last == null ? 0 : now - last;
    lastAtRef.current = now;

    cbStable(delta, now);

    // 重挂下一帧（注意：schedule 是同帧合并的，但这里是“帧回调内重挂”，不会丢帧）
    if (runningRef.current) {
      schedulerRef.current?.schedule(0);
    }
  });

  // 绑定 scheduler ref（确保 tick 回调里用到的是同一个实例）
  schedulerRef.current = scheduler;

  const start = useCallback(() => {
    if (runningRef.current) return;

    runningRef.current = true;
    setRunningState(true);

    lastAtRef.current = null;
    scheduler.schedule(0);
  }, [runningRef, scheduler]);

  const stop = useCallback(() => {
    if (!runningRef.current) return;

    runningRef.current = false;
    setRunningState(false);

    lastAtRef.current = null;
    scheduler.cancel();
  }, [runningRef, scheduler]);

  const toggle = useCallback(() => {
    if (runningRef.current) stop();
    else start();
  }, [runningRef, start, stop]);

  // 首次 autoStart：挂起第一帧
  useEffect(() => {
    if (autoStart) {
      scheduler.schedule(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 卸载清理：不 setState，避免 unmount 阶段无意义的状态更新
  const dispose = useCallback(() => {
    runningRef.current = false;
    lastAtRef.current = null;
    scheduler.cancel();
  }, [runningRef, scheduler]);

  useUnmount(dispose);

  const Actions = useMemo<UseRafLoopActions>(
    () => ({
      start,
      stop,
      toggle,
      get running() {
        return runningRef.current;
      },
      isRunning() {
        return runningRef.current;
      },
    }),
    [runningRef, start, stop, toggle],
  );

  return Actions;
}
