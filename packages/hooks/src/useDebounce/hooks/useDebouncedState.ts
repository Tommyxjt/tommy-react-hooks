import { useCallback, useMemo, useState } from 'react';
import { useLatestRef } from '../../_internal/react/useLatestRef';
import useDebounceController from '../core/useDebounceController';

export interface UseDebouncedStateOptions {
  /**
   * 防抖间隔，默认 500ms
   * 输入框场景：通常 200~500ms
   */
  delay?: number;
  /**
   * 允许首次输入立即执行逻辑。
   * 参考淘宝的防抖输入框：第一次的输入直接触发搜索联想，让页面更快展示
   */
  leading?: boolean;
}

export interface UseDebouncedStateControls<T> {
  /**
   * 防抖值：适合用于请求 / 昂贵计算 / effect 依赖
   */
  debouncedState: T;

  /**
   * 取消本轮尚未触发的 debouncedState 更新（比如：突然清空全部输入）
   */
  cancel: () => void;

  /**
   * 立刻把 debouncedState 更新为最新值（常用于：Enter / 点击搜索按钮）
   */
  flush: () => void;

  /**
   * 是否有尚未触发的 debouncedState 更新（常用于显示正在输入中或者 loading）
   */
  readonly pending: boolean;
}

// 三元组返回类型
export type UseDebouncedStateReturn<T> = readonly [
  /**
   * 即时值：适合绑定 input state
   */
  state: T,
  /**
   * 立即更新 state，并调度 debouncedState 的更新
   */
  setState: (next: React.SetStateAction<T>) => void,
  /**
   * 防抖相关控制与状态
   */
  controls: UseDebouncedStateControls<T>,
];

/**
 * useDebouncedState
 *
 * 使用场景：
 * - 防抖输入框：受控输入 + 延迟请求
 */
function useDebouncedState<T>(
  initialValue: T,
  options: UseDebouncedStateOptions = {},
): UseDebouncedStateReturn<T> {
  const { delay = 500, leading = false } = options;

  const [rawValue, setRawValue] = useState<T>(initialValue);
  const [debouncedState, setDebouncedValue] = useState<T>(initialValue);

  // 记录当前的 state，用于在下一次 setState 接收函数式更新时，计算 nextValue
  const rawValueRef = useLatestRef(rawValue);

  const controller = useDebounceController<T>(
    (payload) => {
      setDebouncedValue(payload);
    },
    {
      delay,
      leading,
      trailing: true,
    },
  );

  const setState = useCallback(
    (next: React.SetStateAction<T>) => {
      const nextState =
        typeof next === 'function' ? (next as (prev: T) => T)(rawValueRef.current) : next;
      // 关键：同步推进 ref，保证同一批次内连续函数式更新能累积
      rawValueRef.current = nextState;

      // 即时更新
      setRawValue(nextState);

      // 防抖更新 debouncedState
      controller.emit(nextState);
    },
    [controller, rawValueRef],
  );

  const controls = useMemo<UseDebouncedStateControls<T>>(
    () => ({
      debouncedState,
      cancel: controller.cancel,
      flush: controller.flush,
      get pending() {
        return controller.pending;
      },
    }),
    [debouncedState, controller],
  );

  // 三元组返回 [state, setState, controls]
  return [rawValue, setState, controls] as const;
}

export default useDebouncedState;
