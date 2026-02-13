import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useLatestRef } from '../../_internal/react/useLatestRef';
import { useStableCallback } from '../../_internal/react/useStableCallback';
import useRafScheduler from '../core/useRafScheduler';

export interface UseRafStateOptions {
  /**
   * 单实例限速（可选）
   * - 例如 15：约 15fps
   * - 默认不限制：有更新就按“下一帧”提交（同帧内合并）
   */
  maxFps?: number;
}

type UpdateFn<T> = (prev: T) => T;

function toUpdateFn<T>(next: SetStateAction<T>): UpdateFn<T> {
  return typeof next === 'function' ? (next as unknown as UpdateFn<T>) : () => next;
}

function compose<T>(prev: UpdateFn<T>, next: UpdateFn<T>): UpdateFn<T> {
  return (s) => next(prev(s));
}

export interface UseRafStateActions<T> {
  flush: () => void;
  cancel: () => void;
  dispose: () => void;

  readonly pending: boolean;
  isPending: () => boolean;

  /** 读取 pending 的“预测下一状态”（无 pending 则为 undefined） */
  getPendingState: () => T | undefined;

  /** 读取“最新状态”：优先 pending 预测值，否则 committed */
  getLatestState: () => T;
}

export type UseRafStateReturn<T> = [T, Dispatch<SetStateAction<T>>, UseRafStateActions<T>];

/**
 * useRafState
 *
 * 将 state 更新合并到“下一帧”再提交（渲染最多每帧一次）。
 * - 支持 value 与函数式更新：同帧内多次函数式更新会被“按顺序组合”（等价于累计）
 * - 不暴露 driver：需要自定义 driver 请用 useRafScheduler
 */
export default function useRafState<T>(
  initialState: T | (() => T),
  options?: UseRafStateOptions,
): UseRafStateReturn<T> {
  const [state, setState] = useState<T>(initialState);
  const stateRef = useLatestRef(state);

  const scheduler = useRafScheduler<UpdateFn<T>>(
    (update: UpdateFn<T>) => {
      setState((prev) => update(prev));
    },
    {
      maxFps: options?.maxFps,
      // 同帧内多次 set：组合 updater，保证函数式更新不会丢（累计语义）
      merge: (prev: UpdateFn<T>, next: UpdateFn<T>) => compose(prev, next),
    },
  );

  const setRafState = useStableCallback((next: SetStateAction<T>) => {
    scheduler.schedule(toUpdateFn(next));
  }) as Dispatch<SetStateAction<T>>;

  const getPendingState = useCallback(() => {
    const pending = scheduler.getLatestPayload();
    return pending ? pending(stateRef.current) : undefined;
  }, [scheduler, stateRef]);

  const getLatestState = useCallback(() => {
    const pending = scheduler.getLatestPayload();
    return pending ? pending(stateRef.current) : stateRef.current;
  }, [scheduler, stateRef]);

  const actions = useMemo<UseRafStateActions<T>>(
    () => ({
      flush: scheduler.flush,
      cancel: scheduler.cancel,
      dispose: scheduler.dispose,
      get pending() {
        return scheduler.pending;
      },
      isPending: scheduler.isPending,
      getPendingState,
      getLatestState,
    }),
    [getLatestState, getPendingState, scheduler],
  );

  return useMemo(
    () => [state, setRafState, actions] as UseRafStateReturn<T>,
    [actions, setRafState, state],
  );
}
