import { act, renderHook } from '@testing-library/react';
import useRafState from '../hooks/useRafState';

describe('useRafState', () => {
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

  // 1) 初始化：state=initialState；pending=false；getLatestState=state；getPendingState=undefined
  it('should initialize state with initialState, pending should be false', () => {
    const { result } = renderHook(() => useRafState(0));
    const [state, , actions] = result.current;

    expect(state).toBe(0);
    expect(actions.pending).toBe(false);
    expect(actions.isPending()).toBe(false);
    expect(actions.getPendingState()).toBeUndefined();
    expect(actions.getLatestState()).toBe(0);
  });

  // 2) 基础：setRafState(value) 不会立刻提交；下一帧提交；pending 正确切换
  it('should commit state on next frame (not immediately) and toggle pending', () => {
    const { result } = renderHook(() => useRafState(0));

    act(() => {
      const [, setRafState] = result.current;
      setRafState(1);
    });

    expect(result.current[0]).toBe(0); // committed 仍旧
    expect(result.current[2].pending).toBe(true);
    expect(result.current[2].getPendingState()).toBe(1);
    expect(result.current[2].getLatestState()).toBe(1);

    act(() => {
      t = 10;
      flushFrame(16.6);
    });

    expect(result.current[0]).toBe(1);
    expect(result.current[2].pending).toBe(false);
    expect(result.current[2].getPendingState()).toBeUndefined();
    expect(result.current[2].getLatestState()).toBe(1);
  });

  // 3) 同一帧多次 set(value)：最终只取最后一次（takeLatest），下一帧提交一次结果
  it('should takeLatest for multiple value updates within the same frame', () => {
    const { result } = renderHook(() => useRafState(0));

    act(() => {
      const [, setRafState] = result.current;
      setRafState(1);
      setRafState(2);
      setRafState(3);
    });

    expect(result.current[0]).toBe(0);
    expect(result.current[2].pending).toBe(true);
    expect(result.current[2].getPendingState()).toBe(3);
    expect(result.current[2].getLatestState()).toBe(3);

    act(() => {
      t = 20;
      flushFrame(16.6);
    });

    expect(result.current[0]).toBe(3);
    expect(result.current[2].pending).toBe(false);
  });

  // 4) 同帧多次函数式更新：应按顺序 compose，等价于累计（对齐 React useState 的语义）
  it('should compose multiple functional updates within the same frame (accumulate)', () => {
    const { result } = renderHook(() => useRafState(0));

    act(() => {
      const [, setRafState] = result.current;
      setRafState((x) => x + 1);
      setRafState((x) => x + 1);
    });

    expect(result.current[0]).toBe(0);
    expect(result.current[2].pending).toBe(true);
    expect(result.current[2].getPendingState()).toBe(2);
    expect(result.current[2].getLatestState()).toBe(2);

    act(() => {
      t = 30;
      flushFrame(16.6);
    });

    expect(result.current[0]).toBe(2);
    expect(result.current[2].pending).toBe(false);
  });

  // 5) 混合更新：先 set(value) 再 set(fn)（同帧），应按顺序 compose（value -> fn）
  it('should compose mixed updates in order (value then functional)', () => {
    const { result } = renderHook(() => useRafState(0));

    act(() => {
      const [, setRafState] = result.current;
      setRafState(10);
      setRafState((x) => x + 1);
    });

    expect(result.current[2].getPendingState()).toBe(11);

    act(() => {
      t = 40;
      flushFrame(16.6);
    });

    expect(result.current[0]).toBe(11);
  });

  // 6) cancel：取消 pending，state 不应改变
  it('should cancel pending commit and keep state unchanged', () => {
    const { result } = renderHook(() => useRafState(0));

    act(() => {
      const [, setRafState, actions] = result.current;
      setRafState(1);
      actions.cancel();
    });

    expect(result.current[0]).toBe(0);
    expect(result.current[2].pending).toBe(false);
    expect(result.current[2].getPendingState()).toBeUndefined();
    expect(result.current[2].getLatestState()).toBe(0);

    act(() => {
      t = 100;
      flushFrame(16.6);
    });

    expect(result.current[0]).toBe(0);
  });

  // 7) flush：立刻同步提交一次，并清空 pending；后续帧不应重复提交
  it('should flush immediately and clear pending', () => {
    const { result } = renderHook(() => useRafState(0));

    act(() => {
      const [, setRafState] = result.current;
      setRafState(2);
    });

    expect(result.current[0]).toBe(0);
    expect(result.current[2].pending).toBe(true);

    act(() => {
      result.current[2].flush();
    });

    expect(result.current[0]).toBe(2);
    expect(result.current[2].pending).toBe(false);

    act(() => {
      t = 200;
      flushFrame(16.6);
    });

    expect(result.current[0]).toBe(2);
  });

  // 8) maxFps：未满足最小间隔时应跳帧重挂；满足后才提交最新值
  it('should respect maxFps (skip frames when interval is too small)', () => {
    const { result } = renderHook(() => useRafState('init', { maxFps: 10 })); // minInterval=100ms

    // 第一次提交
    act(() => {
      const [, setRafState] = result.current;
      setRafState('first');
    });

    t = 0;
    act(() => {
      flushFrame(0);
    });

    expect(result.current[0]).toBe('first');

    // 第二次：很快再次触发
    act(() => {
      const [, setRafState] = result.current;
      setRafState('second');
    });

    // tick 到来：now=50 < 100 => 跳帧，不提交（pending 保留并重挂）
    t = 50;
    act(() => {
      flushFrame(16.6);
    });

    expect(result.current[0]).toBe('first');
    expect(result.current[2].pending).toBe(true);
    expect(result.current[2].getLatestState()).toBe('second');

    // 下一帧：now=120 满足间隔 => 提交
    t = 120;
    act(() => {
      flushFrame(33.3);
    });

    expect(result.current[0]).toBe('second');
    expect(result.current[2].pending).toBe(false);
  });

  // 9) dispose：语义化 cancel（smoke）
  it('dispose should behave like cancel (smoke)', () => {
    const { result } = renderHook(() => useRafState(0));

    act(() => {
      const [, setRafState, actions] = result.current;
      setRafState(1);
      actions.dispose();
    });

    expect(result.current[0]).toBe(0);
    expect(result.current[2].pending).toBe(false);

    act(() => {
      t = 999;
      flushFrame(16.6);
    });

    expect(result.current[0]).toBe(0);
  });
});
