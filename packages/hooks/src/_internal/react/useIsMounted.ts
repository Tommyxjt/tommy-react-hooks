import { useCallback, useEffect, useRef } from 'react';
import { useUnmount } from './useUnmount';

/**
 * useIsMounted
 *
 * 返回一个函数，用于判断组件当前是否仍处于 mounted 状态。
 *
 * 典型用途：
 * - 异步回调/定时器回调中判断是否还能 setState
 */
export function useIsMounted(): () => boolean {
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  useUnmount(() => {
    mountedRef.current = false;
  });

  return useCallback(() => mountedRef.current, []);
}

export default useIsMounted;
