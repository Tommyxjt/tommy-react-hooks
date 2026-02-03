import useDebouncedState from '../index';
import { act, renderHook } from '@testing-library/react';

jest.useFakeTimers();

describe('useDebouncedState', () => {
  it('should initialize state with the provided initial value', () => {
    const { result } = renderHook(() => useDebouncedState(0));
    expect(result.current[0]).toBe(0); // 初始值应该为 0
  });

  it('should update state correctly', () => {
    const { result } = renderHook(() => useDebouncedState(0));
    act(() => {
      result.current[1]((prev) => prev + 1); // 使用 setState 更新 state
    });
    expect(result.current[0]).toBe(1); // state 应该更新为 1
  });

  it('should debounce state updates with the specified delay', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 500 }));
    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    expect(result.current[0]).toBe(1); // state 应该立即更新为 1
    expect(result.current[2]).toBe(0); // debouncedState 应该仍然是初始值

    // 加上模拟的延迟时间
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current[2]).toBe(1); // debouncedState 应该更新为 1
  });

  it('should update debounced state immediately if leading is true', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 500, leading: true }));
    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    expect(result.current[2]).toBe(1); // 由于 leading 是 true，debouncedState 应该立即更新
  });

  it('should skip initial value when skipInitial is true', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 500, skipInitial: true }));
    expect(result.current[2]).toBeUndefined(); // 初始值应该是 undefined
  });

  it('should handle multiple state updates correctly', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 500 }));
    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    // 在 500ms 内，debouncedState 应该只更新一次
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current[2]).toBe(2); // debouncedState 应该是最新值 2
  });

  it('should clear timeout when the component is unmounted', () => {
    const { result, unmount } = renderHook(() => useDebouncedState(0, { delay: 500 }));

    // 创建 spy 来监控 clearTimeout
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    unmount(); // 卸载组件
    expect(clearTimeoutSpy).toHaveBeenCalled(); // 清理定时器
  });

  it('should not update debounced state before delay if skipInitial is true', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 500, skipInitial: true }));
    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    // debouncedState 应该仍然是 undefined，因为 skipInitial 是 true
    expect(result.current[2]).toBeUndefined();

    // 加上模拟的延迟时间
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current[2]).toBe(1); // debouncedState 应该更新为 1
  });
});
