import { act, renderHook } from '@testing-library/react';
import useDebouncedState from '../hooks/useDebouncedState';

jest.useFakeTimers(); // 模拟定时器

describe('useDebouncedState', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  // 1) 初始化：rawValue 与 debouncedState 都等于 initialValue，pending=false
  it('should initialize rawValue and debouncedState with initialValue, pending should be false', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 100 }));

    const [state, , controls] = result.current;
    expect(state).toBe(0);
    expect(controls.debouncedState).toBe(0);
    expect(controls.pending).toBe(false);
  });

  // 2) 基础 trailing 防抖：rawValue 立即更新；debouncedState 延迟更新；pending 正确切换
  it('should update rawValue immediately, and update debouncedState after delay (trailing debounce)', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 100 }));

    act(() => {
      const [, setState] = result.current;
      setState(1);
    });

    expect(result.current[0]).toBe(1); // rawValue 立即更新
    expect(result.current[2].debouncedState).toBe(0); // debouncedState 还没更新
    expect(result.current[2].pending).toBe(true); // 已进入防抖期

    act(() => {
      jest.advanceTimersByTime(100); // 防抖到期
    });

    expect(result.current[2].debouncedState).toBe(1); // debouncedState 更新为最新值
    expect(result.current[2].pending).toBe(false); // 防抖结束
  });

  // 3) 连续多次 setState：debouncedState 只应取最后一次（latest wins）
  it('should debounce multiple updates and apply only the latest value to debouncedState', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 100 }));

    act(() => {
      const [, setState] = result.current;
      setState(1);
      setState(2);
      setState(3);
    });

    expect(result.current[0]).toBe(3); // rawValue 最终是最后一次
    expect(result.current[2].debouncedState).toBe(0); // 还未到期
    expect(result.current[2].pending).toBe(true);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current[2].debouncedState).toBe(3); // debouncedState 取最后一次
    expect(result.current[2].pending).toBe(false);
  });

  // 4) cancel：取消本轮尚未触发的 debouncedState 更新
  it('should cancel pending debouncedState update and keep debouncedState unchanged', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 100 }));

    act(() => {
      const [, setState, controls] = result.current;
      setState(1);
      controls.cancel();
    });

    expect(result.current[0]).toBe(1); // rawValue 已更新
    expect(result.current[2].debouncedState).toBe(0); // debouncedState 仍为旧值（取消了更新）
    expect(result.current[2].pending).toBe(false); // cancel 后应退出 pending

    act(() => {
      jest.advanceTimersByTime(200); // 即使时间过去也不应更新
    });

    expect(result.current[2].debouncedState).toBe(0);
    expect(result.current[2].pending).toBe(false);
  });

  // 5) flush：立刻把 debouncedState 更新为最新值，并清空 pending
  it('should flush debouncedState immediately and clear pending', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 100 }));

    act(() => {
      const [, setState] = result.current;
      setState(2);
    });

    expect(result.current[0]).toBe(2);
    expect(result.current[2].debouncedState).toBe(0);
    expect(result.current[2].pending).toBe(true);

    act(() => {
      result.current[2].flush(); // 立刻更新 debouncedState
    });

    expect(result.current[2].debouncedState).toBe(2);
    expect(result.current[2].pending).toBe(false);

    act(() => {
      jest.advanceTimersByTime(200); // 后续不应再重复更新
    });

    expect(result.current[2].debouncedState).toBe(2);
    expect(result.current[2].pending).toBe(false);
  });

  // 6) leading=true：首次更新应立即同步到 debouncedState（同时仍会进入 pending，待 delay 结束退出）
  it('should update debouncedState immediately when leading is true', () => {
    const { result } = renderHook(() => useDebouncedState(0, { delay: 100, leading: true }));

    act(() => {
      const [, setState] = result.current;
      setState(1);
    });

    expect(result.current[0]).toBe(1); // rawValue 立即更新
    expect(result.current[2].debouncedState).toBe(1); // leading：debouncedState 也应立即更新
    expect(result.current[2].pending).toBe(true); // 仍处于防抖周期中（等待 delay 结束）

    act(() => {
      jest.advanceTimersByTime(100); // delay 到期，结束 cycle
    });

    expect(result.current[2].debouncedState).toBe(1); // 不应重复触发
    expect(result.current[2].pending).toBe(false);
  });

  // 7) 函数式更新：应基于“最新 rawValue”计算 nextState，并正确调度 debouncedState
  it('should support functional update and debounce the computed next value', () => {
    const { result } = renderHook(() => useDebouncedState(1, { delay: 100 }));

    act(() => {
      const [, setState] = result.current;
      setState((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(2); // rawValue 立即更新为 2
    expect(result.current[2].debouncedState).toBe(1); // debouncedState 尚未更新
    expect(result.current[2].pending).toBe(true);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current[2].debouncedState).toBe(2);
    expect(result.current[2].pending).toBe(false);
  });

  // 8) 同一个批次内连续多次函数式更新的语义（对齐 useState）
  it('should accumulate multiple functional updates in the same batch like React useState does (optional semantic)', () => {
    const { result } = renderHook(() => useDebouncedState(1, { delay: 100 }));

    act(() => {
      const [, setState] = result.current;
      setState((prev) => prev + 1);
      setState((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(3);
  });
});
