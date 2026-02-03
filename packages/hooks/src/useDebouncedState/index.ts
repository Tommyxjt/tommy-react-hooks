import { useEffect, useRef, useState } from 'react';

export interface DebounceOptions {
  delay?: number; // 防抖间隔，默认 500ms
  leading?: boolean; // 是否首轮立即执行
  skipInitial?: boolean; // 跳过初始值
}

function useDebouncedState<T>(
  initialValue: T,
  options?: DebounceOptions & { skipInitial?: false },
): [T, React.Dispatch<React.SetStateAction<T>>, T];

function useDebouncedState<T>(
  initialValue: T,
  options: DebounceOptions & { skipInitial: true },
): [T, React.Dispatch<React.SetStateAction<T>>, T | undefined];

/**
 * 用来处理防抖状态的 Hook。
 * 多数场景用于输入防抖，
 * 参考淘宝的输入框实现，允许定义 leading
 */
function useDebouncedState<T>(initialValue: T, options?: DebounceOptions) {
  const { delay = 500, leading = false, skipInitial = false } = options ?? {};
  const [state, setState] = useState<T>(initialValue);
  const [debouncedState, setDebouncedState] = useState<T | undefined>(
    skipInitial ? undefined : initialValue,
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  function setDebouncedly() {
    if (leading && timeoutRef.current === null) setDebouncedState(state);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDebouncedState(state);
      timeoutRef.current = null;
    }, delay);
  }

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    setDebouncedly();

    // 清理定时器
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [state]);

  return [state, setState, debouncedState];
}

export default useDebouncedState;
