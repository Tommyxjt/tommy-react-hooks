import { useCallback, useState } from 'react';
import type React from 'react';
import { useIsMounted } from '../_internal/react/useIsMounted';

/**
 * useSafeSetState
 *
 * 安全版 useState：如果组件已卸载，则忽略本次更新，避免：
 * - Warning: Can't perform a React state update on an unmounted component
 *
 * 使用方式（对齐 useState）：
 * const [state, setState] = useSafeSetState(...)
 */
function useSafeSetState<S>(
  initialState: S | (() => S),
): readonly [S, React.Dispatch<React.SetStateAction<S>>] {
  const [state, setState] = useState<S>(initialState);

  const isMounted = useIsMounted();

  const safeSetState = useCallback<React.Dispatch<React.SetStateAction<S>>>((next) => {
    if (!isMounted()) return;
    setState(next);
  }, []);

  return [state, safeSetState] as const;
}

export default useSafeSetState;
