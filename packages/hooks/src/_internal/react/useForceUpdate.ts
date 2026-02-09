import { useCallback, useReducer } from 'react';

/**
 * useForceUpdate
 *
 * 强制触发一次 rerender。
 * 典型用途：
 * - 订阅模型/控制器模型里，需要在不改变业务 state 的情况下刷新视图
 */
export function useForceUpdate(): () => void {
  const [, force] = useReducer((x: number) => x + 1, 0);
  return useCallback(() => force(), []);
}

export default useForceUpdate;
