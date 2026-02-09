import { type DependencyList, type EffectCallback, useEffect, useRef } from 'react';

/**
 * useUpdateEffect
 *
 * 与 useEffect 类似，但会跳过首次渲染，仅在依赖更新时触发。
 *
 * 典型用途：
 * - 不想在 mount 时执行副作用，只在更新时执行（替代很多“skipInitial”诉求）
 */
export function useUpdateEffect(effect: EffectCallback, deps?: DependencyList): void {
  const isFirstRef = useRef(true);

  useEffect(() => {
    if (isFirstRef.current) {
      isFirstRef.current = false;
      return;
    }
    return effect();
    // 注意：deps 的传入方式应与 useEffect 一致，由使用者决定依赖
  }, deps);
}

export default useUpdateEffect;
