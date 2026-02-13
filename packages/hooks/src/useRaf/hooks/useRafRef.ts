import { useCallback, useMemo, useRef } from 'react';
import { useStableCallback } from '../../_internal/react/useStableCallback';
import useRafScheduler from '../core/useRafScheduler';

export interface UseRafRefActions<T> {
  /** 立刻同步提交一次（若存在 pending） */
  flush: () => void;
  /** 撤销下一帧提交并清空 pending */
  cancel: () => void;
  /** 释放资源（语义化 cancel） */
  dispose: () => void;

  /** 渲染用：是否存在尚未提交的帧任务 */
  readonly pending: boolean;
  /** 函数式读取：避免闭包误用 */
  isPending: () => boolean;

  /** 读取“待提交”的值（若无 pending 则为 undefined） */
  getPendingValue: () => T | undefined;

  /** 读取“最新值”：优先 pending，否则 committed(ref.current) */
  getLatestValue: () => T;
}

export type UseRafRefReturn<T> = [
  /** committed ref：只在下一帧（或 flush）才会写入 */
  React.MutableRefObject<T>,
  /** schedule：同帧内 takeLatest，下一帧写入 ref.current */
  (next: T) => void,
  UseRafRefActions<T>,
];

/**
 * useRafRef（takeLatest）
 *
 * 将高频写入合并到“下一帧”再写入 ref.current（默认 takeLatest）。
 * - 不触发 rerender
 * - 适合：高频输入 -> 给 loop / canvas / webgl 等 imperative 逻辑读取
 */
export default function useRafRef<T>(initialValue: T): UseRafRefReturn<T> {
  const ref = useRef<T>(initialValue);

  const scheduler = useRafScheduler<T>((next: T) => {
    ref.current = next;
  });

  const set = useStableCallback((next: T) => {
    scheduler.schedule(next);
  });

  const getPendingValue = useCallback(() => scheduler.getLatestPayload(), [scheduler]);
  const getLatestValue = useCallback(
    () => scheduler.getLatestPayload() ?? ref.current,
    [scheduler],
  );

  const actions = useMemo<UseRafRefActions<T>>(
    () => ({
      flush: scheduler.flush,
      cancel: scheduler.cancel,
      dispose: scheduler.dispose,
      get pending() {
        return scheduler.pending;
      },
      isPending: scheduler.isPending,
      getPendingValue,
      getLatestValue,
    }),
    [getLatestValue, getPendingValue, scheduler],
  );

  return useMemo(() => [ref, set, actions] as UseRafRefReturn<T>, [actions, ref, set]);
}
