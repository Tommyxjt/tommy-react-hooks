import { act, renderHook } from '@testing-library/react';
import useRafLoop from '../hooks/useRafLoop';

describe('useRafLoop', () => {
  // ---- ensure RAF APIs exist in test env ----
  const hadRaf = 'requestAnimationFrame' in globalThis;
  const hadCaf = 'cancelAnimationFrame' in globalThis;
  const originalRaf = (globalThis as any).requestAnimationFrame;
  const originalCaf = (globalThis as any).cancelAnimationFrame;

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

  // 1) 默认 autoStart=true：mount 后会挂起第一帧，running=true
  it('should autoStart by default (running=true, schedule first frame)', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useRafLoop(cb));

    expect(result.current.running).toBe(true);
    expect(result.current.isRunning()).toBe(true);

    // 初始 effect schedule(0)
    expect(mockRaf).toHaveBeenCalledTimes(1);
  });

  // 2) 连续帧回调：应每帧执行一次，并提供 delta/time（time=meta.at=driver.now）
  it('should call callback every frame with correct delta/time', () => {
    const cb = jest.fn();
    renderHook(() => useRafLoop(cb));

    // 第 1 帧：delta=0, time=t
    t = 10;
    act(() => {
      flushFrame(0);
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(0, 10);

    // flush 内会重挂下一帧
    expect(mockRaf).toHaveBeenCalledTimes(2);

    // 第 2 帧：delta = 25 - 10 = 15
    t = 25;
    act(() => {
      flushFrame(16.6);
    });

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(15, 25);
  });

  // 3) autoStart=false：不会自动启动，也不会 schedule
  it('should not autoStart when autoStart=false', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useRafLoop(cb, { autoStart: false }));

    expect(result.current.running).toBe(false);
    expect(result.current.isRunning()).toBe(false);
    expect(mockRaf).toHaveBeenCalledTimes(0);
  });

  // 4) start：从停止状态启动，并挂起第一帧；重复 start 不应重复 schedule
  it('start() should start the loop and be idempotent', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useRafLoop(cb, { autoStart: false }));

    act(() => {
      result.current.start();
    });

    expect(result.current.running).toBe(true);
    expect(mockRaf).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.start();
    });

    // 已 running：不应重复 schedule
    expect(mockRaf).toHaveBeenCalledTimes(1);

    t = 5;
    act(() => {
      flushFrame(0);
    });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  // 5) stop：停止循环并撤销 pending tick；重复 stop 不应额外 cancel
  it('stop() should stop the loop, cancel pending tick, and be idempotent', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useRafLoop(cb)); // autoStart=true

    expect(mockRaf).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.stop();
    });

    expect(result.current.running).toBe(false);
    expect(mockCaf).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.stop();
    });

    // 已 stopped：不应重复 cancel
    expect(mockCaf).toHaveBeenCalledTimes(1);

    t = 20;
    act(() => {
      flushFrame(16.6);
    });

    expect(cb).toHaveBeenCalledTimes(0);
  });

  // 6) toggle：应在 start/stop 之间切换
  it('toggle() should switch between running and stopped', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useRafLoop(cb, { autoStart: false }));

    expect(result.current.running).toBe(false);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.running).toBe(true);
    expect(mockRaf).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.running).toBe(false);
    expect(mockCaf).toHaveBeenCalledTimes(1);
  });

  // 7) unmount：应清理并取消 pending tick，之后 flushFrame 不应再触发回调
  it('should dispose on unmount (cancel pending) and not invoke after unmount', () => {
    const cb = jest.fn();
    const { unmount } = renderHook(() => useRafLoop(cb)); // autoStart=true => 有 pending

    expect(mockRaf).toHaveBeenCalledTimes(1);

    unmount();

    // useUnmount(dispose) -> scheduler.cancel() -> cancelAnimationFrame
    expect(mockCaf).toHaveBeenCalledTimes(1);

    t = 30;
    act(() => {
      flushFrame(16.6);
    });

    expect(cb).toHaveBeenCalledTimes(0);
  });
});
