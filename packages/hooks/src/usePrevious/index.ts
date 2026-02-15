import { useEffect, useRef } from 'react';

export interface UsePreviousOptions<T> {
  /**
   * 第一次渲染时返回的“上一值”
   */
  initialValue?: T;
  /**
   * 控制何时更新上一值；返回 true 才会把 next 写入 ref
   */
  shouldUpdate?: (prev: T | undefined, next: T) => boolean;
}

function usePrevious<T>(value: T, options: UsePreviousOptions<T> = {}): T | undefined {
  const { initialValue, shouldUpdate } = options;

  const ref = useRef<T | undefined>(initialValue);

  // ref.current 在 render 阶段就是“上一值”
  const previous = ref.current;

  useEffect(() => {
    const prevValue = ref.current;
    if (!shouldUpdate || shouldUpdate(prevValue, value)) {
      ref.current = value;
    }
  }, [value, shouldUpdate]);

  return previous;
}

export default usePrevious;
