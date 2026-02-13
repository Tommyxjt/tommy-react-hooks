import { act, renderHook } from '@testing-library/react';
import useRafThrottledEffect from '../hooks/useRafThrottledEffect';

describe('useRafThrottledEffect', () => {
  // ---- RAF mock (queue + cancel) ----
  const hadRaf = 'requestAnimationFrame' in globalThis;
  const hadCaf = 'cancelAnimationFrame' in globalThis;
  const originalRaf = (globalThis as any).requestAnimationFrame;
  const originalCaf = (globalThis as any).cancelAnimationFrame;

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

  // ---- time control (driver.now => performance.now / Date.now) ----
  let t = 0;
  let perfNowSpy: jest.SpyInstance | null = null;
  let dateNowSpy: jest.SpyInstance | null = null;

  beforeAll(() => {
    if (!hadRaf) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', {
        value: (cb: any) => setTimeout(() => cb(0), 0),
        writable: true,
        configurable: true,
      });
    }
    if (!hadCaf) {
      Object.defineProperty(globalThis, 'cancelAnimationFrame', {
        value: (_id: any) => {},
        writable: true,
        configurable: true,
      });
    }
  });

  afterAll(() => {
    if (!hadRaf) {
      // @ts-expect-error: requestAnimationFrame is non-optional in typings; delete to simulate missing RAF env
      delete globalThis.requestAnimationFrame;
    } else {
      Object.defineProperty(globalThis, 'requestAnimationFrame', {
        value: originalRaf,
        writable: true,
        configurable: true,
      });
    }

    if (!hadCaf) {
      // @ts-expect-error: cancelAnimationFrame is non-optional in typings; delete to simulate missing RAF env
      delete globalThis.cancelAnimationFrame;
    } else {
      Object.defineProperty(globalThis, 'cancelAnimationFrame', {
        value: originalCaf,
        writable: true,
        configurable: true,
      });
    }
  });

  beforeEach(() => {
    nextId = 1;
    rafQueue = [];
    rafIdToCb = new Map();
    t = 0;

    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(mockRaf as any);
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(mockCaf as any);

    if (
      typeof performance !== 'undefined' &&
      performance &&
      typeof performance.now === 'function'
    ) {
      perfNowSpy = jest.spyOn(performance, 'now').mockImplementation(() => t);
    } else {
      perfNowSpy = null;
    }
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => t);
  });

  afterEach(() => {
    perfNowSpy?.mockRestore();
    dateNowSpy?.mockRestore();

    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  // 1) mount 会根据 deps 调度一次（但真正执行在下一帧/限速后）
  it('should schedule once on mount (deps effect) and run on next frame', () => {
    const effect = jest.fn();

    const { result } = renderHook(() => useRafThrottledEffect(effect, []));

    expect(mockRaf).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);

    act(() => {
      t = 0;
      flushFrame(16.6);
    });

    expect(effect).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  // 2) 同一帧多次 run：takeLatest 合并 -> 下一帧只执行一次
  it('should coalesce multiple run() calls within the same frame (invoke once)', () => {
    const effect = jest.fn();
    const { result } = renderHook(() => useRafThrottledEffect(effect, []));

    // 先把 mount 那次执行掉
    act(() => {
      flushFrame(16.6);
    });
    effect.mockClear();
    mockRaf.mockClear();

    act(() => {
      result.current.run();
      result.current.run();
      result.current.run();
    });

    expect(mockRaf).toHaveBeenCalledTimes(1);

    act(() => {
      flushFrame(16.6);
    });

    expect(effect).toHaveBeenCalledTimes(1);
  });

  // 3) cancel：撤销 pending，不触发 effect，也不触发 cleanup
  it('cancel() should prevent pending effect from running and not run cleanup', () => {
    const cleanup = jest.fn();
    const effect = jest.fn(() => cleanup);

    const { result } = renderHook(() => useRafThrottledEffect(effect, []));

    // 先执行 mount 的第一次，让 cleanupRef 有值
    act(() => {
      flushFrame(16.6);
    });
    expect(effect).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(0);

    effect.mockClear();
    cleanup.mockClear();
    mockRaf.mockClear();
    mockCaf.mockClear();

    act(() => {
      result.current.run();
    });
    expect(result.current.pending).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(cleanup).toHaveBeenCalledTimes(0);

    act(() => {
      flushFrame(16.6);
    });

    expect(effect).toHaveBeenCalledTimes(0);
    expect(cleanup).toHaveBeenCalledTimes(0);
  });

  // 4) flush：若存在 pending，应立刻同步执行一次，并且不应在下一帧重复执行
  it('flush() should run effect immediately and not run again on next frame', () => {
    const effect = jest.fn();
    const { result } = renderHook(() => useRafThrottledEffect(effect, []));

    // 先执行 mount 的那次
    act(() => {
      flushFrame(16.6);
    });
    effect.mockClear();
    mockRaf.mockClear();
    mockCaf.mockClear();

    act(() => {
      result.current.run();
    });

    expect(result.current.pending).toBe(true);

    act(() => {
      result.current.flush();
    });

    expect(effect).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
    expect(mockCaf).toHaveBeenCalled(); // flush 会撤销 tick，避免下一帧空跑

    act(() => {
      flushFrame(16.6);
    });

    expect(effect).toHaveBeenCalledTimes(1);
  });

  // 5) deps 变化：下一次真正执行前会先 cleanup 上一次（对齐 useEffect 语义）
  it('should cleanup previous effect before the next actual run triggered by deps change', () => {
    const cleanup1 = jest.fn();
    const cleanup2 = jest.fn();

    const effect = jest
      .fn()
      .mockImplementationOnce(() => cleanup1)
      .mockImplementationOnce(() => cleanup2);

    const { rerender } = renderHook(({ dep }) => useRafThrottledEffect(effect, [dep]), {
      initialProps: { dep: 0 },
    });

    act(() => {
      flushFrame(16.6);
    });

    expect(effect).toHaveBeenCalledTimes(1);
    expect(cleanup1).toHaveBeenCalledTimes(0);

    rerender({ dep: 1 });
    expect(cleanup1).toHaveBeenCalledTimes(0);

    act(() => {
      flushFrame(16.6);
    });

    expect(cleanup1).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledTimes(2);
  });

  // 6) enabled=false：run/flush/cancel 都 no-op；mount 也不应 schedule
  it('should no-op when enabled=false', () => {
    const effect = jest.fn();

    const { result } = renderHook(() => useRafThrottledEffect(effect, [], { enabled: false }));

    expect(mockRaf).toHaveBeenCalledTimes(0);
    expect(result.current.pending).toBe(false);

    act(() => {
      result.current.run();
      result.current.flush();
      result.current.cancel();
    });

    expect(mockRaf).toHaveBeenCalledTimes(0);

    act(() => {
      flushFrame(16.6);
    });

    expect(effect).toHaveBeenCalledTimes(0);
  });

  // 7) 先 run 再 disabled：tick 到来时应被 shouldInvoke 拦截（不执行 effect）
  it('should not invoke if disabled before the scheduled frame (shouldInvoke guard)', () => {
    const effect = jest.fn();

    const { result, rerender } = renderHook(
      ({ enabled }) => useRafThrottledEffect(effect, [], { enabled }),
      { initialProps: { enabled: true } },
    );

    // 先把 mount 那次执行掉
    act(() => {
      flushFrame(16.6);
    });
    effect.mockClear();
    mockRaf.mockClear();

    act(() => {
      result.current.run();
    });
    expect(mockRaf).toHaveBeenCalledTimes(1);

    // 下一帧到来前关闭
    rerender({ enabled: false });

    act(() => {
      flushFrame(16.6);
    });

    expect(effect).toHaveBeenCalledTimes(0);
    expect(result.current.pending).toBe(false);
  });

  // 8) maxFps：未满足最小间隔时会跳帧重挂，满足后才执行
  it('should respect maxFps (skip frames when interval is too small)', () => {
    const effect = jest.fn();

    const { result } = renderHook(() => useRafThrottledEffect(effect, [], { maxFps: 10 })); // minInterval=100ms

    // mount 执行一次
    t = 0;
    act(() => {
      flushFrame(16.6);
    });
    expect(effect).toHaveBeenCalledTimes(1);

    effect.mockClear();
    mockRaf.mockClear();

    act(() => {
      result.current.run();
    });

    // t=50 < 100 => 跳帧，不执行
    t = 50;
    act(() => {
      flushFrame(16.6);
    });

    expect(effect).toHaveBeenCalledTimes(0);
    expect(result.current.pending).toBe(true);

    // t=120 >= 100 => 执行
    t = 120;
    act(() => {
      flushFrame(16.6);
    });

    expect(effect).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  // 9) unmount：取消 pending，并做最后一次 cleanup
  it('should cleanup on unmount and not run again after unmount', () => {
    const cleanup = jest.fn();
    const effect = jest.fn(() => cleanup);

    const { result, unmount } = renderHook(() => useRafThrottledEffect(effect, []));

    act(() => {
      flushFrame(16.6);
    });
    expect(effect).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(0);

    // 再 schedule 一次但不执行
    act(() => {
      result.current.run();
    });

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);

    act(() => {
      flushFrame(16.6);
    });

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
