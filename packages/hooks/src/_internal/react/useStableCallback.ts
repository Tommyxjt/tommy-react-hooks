import { useCallback } from 'react';
import { useLatestRef } from './useLatestRef';

/**
 * useStableCallback
 *
 * 返回一个“引用永远稳定”的函数，但内部始终调用最新的 fn。
 * 用于避免闭包陷阱，同时避免把 fn 放进依赖导致回调频繁变更。
 *
 * 典型用途：
 * - 定时器/订阅回调里调用最新逻辑
 * - 作为 event handler 传给子组件，但不希望函数引用每次 render 变化
 */
export function useStableCallback<F extends (...args: any[]) => any>(fn: F): F {
  const fnRef = useLatestRef(fn);

  // 该 callback 永远稳定，但每次执行时调用最新的 fnRef.current
  return useCallback(((...args: Parameters<F>) => fnRef.current(...args)) as F, []);
}

export default useStableCallback;
