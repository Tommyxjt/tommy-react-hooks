import { act, renderHook } from '@testing-library/react';
import useDebouncedCallback from '../hooks/useDebouncedCallback';

jest.useFakeTimers(); // 模拟定时器

describe('useDebouncedCallback', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  // 1) 基础 trailing 防抖：连续多次触发，只执行最后一次（参数也应取最后一次）
  it('should call fn only once with the latest args after delay', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, { delay: 100 }));

    act(() => {
      const [debounced] = result.current;
      debounced(1);
      debounced(2);
      debounced(3);
    });

    // 防抖期内不应执行
    expect(fn).not.toHaveBeenCalled();

    // pending 应为 true
    expect(result.current[1].pending).toBe(true);

    act(() => {
      jest.advanceTimersByTime(100); // delay 到期，触发 trailing
    });

    // 只执行一次，并且是最后一次参数
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(3);

    // 防抖结束 pending 复位
    expect(result.current[1].pending).toBe(false);
  });

  // 2) pending 状态语义：触发后进入 pending，到期后退出 pending
  it('should correctly toggle pending state around the debounce window', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, { delay: 100 }));

    expect(result.current[1].pending).toBe(false);

    act(() => {
      result.current[0]();
    });

    expect(result.current[1].pending).toBe(true);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current[1].pending).toBe(false);
  });

  // 3) cancel：取消后永不触发，并且 pending 立即复位
  it('should not call fn after cancel and should clear pending', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, { delay: 100 }));

    act(() => {
      result.current[0]();
    });

    expect(result.current[1].pending).toBe(true);

    act(() => {
      result.current[1].cancel(); // 取消本轮尚未触发的调用
    });

    expect(result.current[1].pending).toBe(false);

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(fn).not.toHaveBeenCalled();
  });

  // 4) flush：立刻执行“最后一次待触发的调用”，并清空 pending；后续到期不应重复执行
  it('should call fn immediately on flush with the latest args and clear pending', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, { delay: 100 }));

    act(() => {
      result.current[0](1);
      result.current[0](2);
    });

    expect(fn).not.toHaveBeenCalled();
    expect(result.current[1].pending).toBe(true);

    act(() => {
      result.current[1].flush(); // 立刻执行最后一次
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(2);
    expect(result.current[1].pending).toBe(false);

    act(() => {
      jest.advanceTimersByTime(200); // 后续不应重复执行
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  // 5) flush 边界：非 pending 状态下 flush 必须是 no-op
  it('should do nothing when flush is called while not pending', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, { delay: 100 }));

    expect(result.current[1].pending).toBe(false);

    act(() => {
      result.current[1].flush();
    });

    expect(fn).not.toHaveBeenCalled();
    expect(result.current[1].pending).toBe(false);
  });

  // 6) fn 更新：应始终调用最新 fn（useLatestRef 防旧闭包）
  it('should always call the latest fn after rerender', () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();

    const { result, rerender } = renderHook(
      ({ fn }: { fn: (...args: any[]) => any }) => useDebouncedCallback(fn, { delay: 100 }),
      { initialProps: { fn: fn1 } },
    );

    act(() => {
      result.current[0]('x'); // 触发一次，进入 pending
    });

    // pending 期间更新 fn
    rerender({ fn: fn2 });

    act(() => {
      jest.advanceTimersByTime(100); // 到期触发 trailing
    });

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenLastCalledWith('x');
  });

  // 7) maxWait：连续频繁触发，必须在 maxWait 到期时至少执行一次（取 latest args），且不应在 trailing 到期时重复执行同一份 payload
  it('should invoke by maxWait using latest args when calls keep happening within delay', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, { delay: 100, maxWait: 250 }));

    act(() => {
      result.current[0](1); // t=0
    });

    act(() => {
      jest.advanceTimersByTime(90); // t=90（< delay）
      result.current[0](2);
    });

    act(() => {
      jest.advanceTimersByTime(90); // t=180（< delay）
      result.current[0](3);
    });

    // 还没到 maxWait，不应执行
    expect(fn).toHaveBeenCalledTimes(0);

    act(() => {
      jest.advanceTimersByTime(70); // t=250，maxWait 到期：应执行一次（latest=3）
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(3);

    // maxWait 触发后，后续 trailing 到期不应再重复执行
    act(() => {
      jest.advanceTimersByTime(40); // t=290（跨过 t=280 的 trailing 到期点）
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current[1].pending).toBe(false);
  });
});
