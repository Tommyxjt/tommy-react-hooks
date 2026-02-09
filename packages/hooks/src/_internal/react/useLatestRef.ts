import { useRef } from 'react';

/**
 * 返回一个稳定的 ref
 * 每次 render 时都会将 ref.current 同步更新为最新的 value
 * 使得异步回调 / 事件处理 / 卸载清理函数永远读到最新值，同时又不触发 rerender
 * @param value
 * @returns
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export default useLatestRef;
