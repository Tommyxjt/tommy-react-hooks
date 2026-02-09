import { useEffect } from 'react';
import { useLatestRef } from './useLatestRef';

/**
 * 在组件卸载（unmount）时执行传入的回调 fn
 * 同时使用 useLatestRef 保证卸载时拿到的是最新的 fn
 * @param fn
 */
export function useUnmount(fn: () => void) {
  // 把 fn 放进 ref，并在每次 render 时把 ref.current 更新成最新的 fn
  const fnRef = useLatestRef(fn);
  // effect 只在 mount 时注册一次；
  // cleanup 在 unmount 时执行
  useEffect(() => () => fnRef.current(), []);
}

export default useUnmount;
