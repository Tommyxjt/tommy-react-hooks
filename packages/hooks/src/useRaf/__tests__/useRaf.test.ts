import { act, renderHook } from '@testing-library/react';
import useRaf from '../hooks/useRaf';

describe('useRaf', () => {
  // ---- RAF mock (queue + cancel) ----
  let rafQueue: Array<(t: number) => void> = [];
  let nextId = 1;
  let rafIdToCb = new Map<number, (t: number) => void>();

  const mockRaf = jest.fn((cb: (t: number) => void) => {
    const id = nextId++;
    rafIdToCb.set(id, cb);
    rafQueue.push(cb);
    return id;
  });

  const mockCaf = jest.fn((id: number) => {
    const cb = rafIdToCb.get(id);
    rafIdToCb.delete(id);
    if (!cb) return;
    rafQueue = rafQueue.filter((x) => x !== cb);
  });

  // 执行一帧：flush 开始时快照，flush 期间新注册进入下一帧（贴近平台语义）
  const flushFrame = (time = 16.6) => {
    const snapshot = rafQueue.slice();
    rafQueue = [];
    snapshot.forEach((cb) => cb(time));
  };

  // ---- time control (driver.now) ----
  let t = 0;
  let perfNowSpy: jest.SpyInstance | null = null;
  let dateNowSpy: jest.SpyInstance | null = null;

  beforeEach(() => {
    nextId = 1;
    rafQueue = [];
    rafIdToCb = new Map();

    t = 0;

    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(mockRaf as any);
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(mockCaf as any);

    // driver.now() 通常优先走 performance.now()（存在则会绕开 Date.now）
    if (
      typeof performance !== 'undefined' &&
      performance &&
      typeof performance.now === 'function'
    ) {
      perfNowSpy = jest.spyOn(performance, 'now').mockImplementation(() => t);
    } else {
      perfNowSpy = null;
    }
    // 兜底：若内部走 Date.now()
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => t);
  });

  afterEach(() => {
    perfNowSpy?.mockRestore();
    dateNowSpy?.mockRestore();

    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  // 1) 初始化：pending=false
  it('should initialize pending as false', () => {
    const { result } = renderHook(() => useRaf(() => {}));
    expect(result.current.pending).toBe(false);
    expect(result.current.isPending()).toBe(false);
  });

  // 2) 基础：调用一次 => 下一帧执行一次，pending 正确切换
  it('should invoke once on next frame and toggle pending', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useRaf(fn));

    act(() => {
      result.current(1 as any);
    });

    expect(result.current.pending).toBe(true);
    expect(result.current.isPending()).toBe(true);
    expect(mockRaf).toHaveBeenCalledTimes(1);

    act(() => {
      flushFrame(100);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
    expect(result.current.pending).toBe(false);
    expect(result.current.isPending()).toBe(false);
  });

  // 3) 同一帧内多次调用：takeLatest（最后一次参数生效），且只执行一次
  it('should takeLatest within the same frame and invoke only once', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useRaf(fn));

    act(() => {
      result.current(1 as any);
      result.current(2 as any);
      result.current(3 as any);
    });

    expect(mockRaf).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);

    act(() => {
      flushFrame(100);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
    expect(result.current.pending).toBe(false);
  });

  // 4) cancel：撤销下一帧执行并清空 pending
  it('should cancel pending invoke and clear pending', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useRaf(fn));

    act(() => {
      result.current('a' as any);
    });

    expect(result.current.pending).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(mockCaf).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);

    act(() => {
      flushFrame(100);
    });

    expect(fn).toHaveBeenCalledTimes(0);
  });

  // 5) flush：若存在 pending，则立刻同步执行一次，并且不应在下一帧重复执行
  it('should flush immediately and not invoke again on next frame', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useRaf(fn));

    act(() => {
      result.current(42 as any);
    });

    expect(result.current.pending).toBe(true);

    act(() => {
      result.current.flush();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(42);
    expect(result.current.pending).toBe(false);

    act(() => {
      flushFrame(100);
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  // 6) unmount：应 dispose（cancel），避免卸载后还执行
  it('should dispose on unmount and not invoke after unmount', () => {
    const fn = jest.fn();
    const { result, unmount } = renderHook(() => useRaf(fn));

    act(() => {
      result.current(1 as any);
    });

    expect(result.current.pending).toBe(true);

    unmount();

    // useRafScheduler 内部 useUnmount(dispose) => 应 cancel RAF
    expect(mockCaf).toHaveBeenCalledTimes(1);

    act(() => {
      flushFrame(100);
    });

    expect(fn).toHaveBeenCalledTimes(0);
  });

  // 7) 回调更新：invoke 变化后应调用最新的（useStableCallback）
  it('should always call latest invoke after rerender', () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();

    const { result, rerender } = renderHook(({ fn }) => useRaf(fn), {
      initialProps: { fn: fn1 },
    });

    rerender({ fn: fn2 });

    act(() => {
      result.current(7 as any);
      flushFrame(100);
    });

    expect(fn1).toHaveBeenCalledTimes(0);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledWith(7);
  });

  // 8) maxFps：开启限速后，tick 到来但未满足最小间隔会“跳帧重挂”
  it('should respect maxFps (skip frames when interval is too small)', () => {
    const fn = jest.fn();

    const { result } = renderHook(() => useRaf(fn, { maxFps: 10 })); // minInterval=100ms

    // 第一次：安排并执行
    act(() => {
      result.current('first' as any);
    });

    t = 0;
    act(() => {
      flushFrame(0);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('first');

    // 第二次：很快再次触发
    act(() => {
      result.current('second' as any);
    });

    // tick 到来：now=50 < 100ms => 跳帧，不执行（保留 pending + payload，并重挂下一帧）
    t = 50;
    act(() => {
      flushFrame(16.6);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);

    // 下一帧：now=120 满足间隔 => 执行
    t = 120;
    act(() => {
      flushFrame(33.3);
    });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('second');
    expect(result.current.pending).toBe(false);
  });

  // 9) 多参数：应保持参数列表（Args）原样透传
  it('should forward multiple args to invoke', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useRaf(fn));

    act(() => {
      result.current(1 as any, 'x' as any, { ok: true } as any);
      flushFrame(100);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1, 'x', { ok: true });
  });
});
