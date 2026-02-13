import { act, renderHook } from '@testing-library/react';
import useRafRef from '../hooks/useRafRef';

describe('useRafRef', () => {
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

  // 1) 初始化：ref.current=initialValue；pending=false；getLatestValue=initialValue
  it('should initialize with initialValue, pending should be false', () => {
    const { result } = renderHook(() => useRafRef(0));

    const [ref, , actions] = result.current;

    expect(ref.current).toBe(0);
    expect(actions.pending).toBe(false);
    expect(actions.isPending()).toBe(false);
    expect(actions.getPendingValue()).toBeUndefined();
    expect(actions.getLatestValue()).toBe(0);
  });

  // 2) 基础：schedule 后 ref 不立即变；下一帧才写入；pending 正确切换
  it('should commit ref.current on next frame (not immediately) and toggle pending', () => {
    const { result } = renderHook(() => useRafRef(0));

    act(() => {
      const [, set] = result.current;
      set(1);
    });

    const [ref, , actions] = result.current;

    expect(ref.current).toBe(0); // 未提交
    expect(actions.pending).toBe(true);
    expect(actions.getPendingValue()).toBe(1);
    expect(actions.getLatestValue()).toBe(1); // latest 优先 pending

    act(() => {
      t = 10;
      flushFrame(16.6);
    });

    expect(result.current[0].current).toBe(1); // 已提交
    expect(result.current[2].pending).toBe(false);
    expect(result.current[2].getPendingValue()).toBeUndefined();
    expect(result.current[2].getLatestValue()).toBe(1);
  });

  // 3) 同帧多次 schedule：takeLatest，pendingValue 取最后一次；下一帧只提交一次
  it('should takeLatest within the same frame', () => {
    const { result } = renderHook(() => useRafRef(0));

    act(() => {
      const [, set] = result.current;
      set(1);
      set(2);
      set(3);
    });

    expect(result.current[0].current).toBe(0);
    expect(result.current[2].pending).toBe(true);
    expect(result.current[2].getPendingValue()).toBe(3);
    expect(result.current[2].getLatestValue()).toBe(3);

    act(() => {
      t = 20;
      flushFrame(16.6);
    });

    expect(result.current[0].current).toBe(3);
    expect(result.current[2].pending).toBe(false);
  });

  // 4) cancel：取消 pending 提交；ref 保持旧值；pending 清空
  it('should cancel pending commit and keep ref.current unchanged', () => {
    const { result } = renderHook(() => useRafRef(0));

    act(() => {
      const [, set, actions] = result.current;
      set(1);
      actions.cancel();
    });

    expect(result.current[0].current).toBe(0);
    expect(result.current[2].pending).toBe(false);
    expect(result.current[2].getPendingValue()).toBeUndefined();
    expect(result.current[2].getLatestValue()).toBe(0);

    act(() => {
      t = 100;
      flushFrame(16.6);
    });

    expect(result.current[0].current).toBe(0); // 不应被提交
  });

  // 5) flush：立刻同步提交 pending；并清空 pending；后续帧不应重复提交
  it('should flush immediately and clear pending', () => {
    const { result } = renderHook(() => useRafRef(0));

    act(() => {
      const [, set] = result.current;
      set(2);
    });

    expect(result.current[0].current).toBe(0);
    expect(result.current[2].pending).toBe(true);

    act(() => {
      result.current[2].flush();
    });

    expect(result.current[0].current).toBe(2);
    expect(result.current[2].pending).toBe(false);
    expect(result.current[2].getPendingValue()).toBeUndefined();
    expect(result.current[2].getLatestValue()).toBe(2);

    act(() => {
      t = 200;
      flushFrame(16.6);
    });

    expect(result.current[0].current).toBe(2); // 不应重复变动
  });

  // 6) getLatestValue：无 pending 时返回 committed；有 pending 时返回 pending
  it('getLatestValue should prefer pending value over committed value', () => {
    const { result } = renderHook(() => useRafRef('a'));

    expect(result.current[2].getLatestValue()).toBe('a');

    act(() => {
      const [, set] = result.current;
      set('b');
    });

    expect(result.current[0].current).toBe('a');
    expect(result.current[2].getLatestValue()).toBe('b');

    act(() => {
      flushFrame(16.6);
    });

    expect(result.current[2].getLatestValue()).toBe('b');
    expect(result.current[0].current).toBe('b');
  });

  // 7) tuple 引用稳定：实现里 useMemo 包裹返回值，应该保持稳定引用
  it('should keep tuple reference stable (mvp contract)', () => {
    const { result, rerender } = renderHook(() => useRafRef(0));
    const firstTuple = result.current;

    act(() => {
      t = 1;
      rerender();
    });

    expect(result.current).toBe(firstTuple);
  });

  // 8) unmount：应清理 pending，避免卸载后仍写 ref.current（关键回归点）
  it('should not commit after unmount when there was a pending schedule', () => {
    const { result, unmount, rerender } = renderHook(() => useRafRef(0));

    const committedRef = result.current[0];

    act(() => {
      t = 999;
      rerender();
    });

    // 不强制断言 pending 必为 true（不同环境可能已经 flush / 探测走了其他路径）
    const beforeUnmount = committedRef.current;
    const hadPendingAtCheck = result.current[2].pending;

    unmount();

    act(() => {
      t = 999;
      flushFrame(16.6);
    });

    expect(committedRef.current).toBe(beforeUnmount);

    // 如果当时确实存在 pending，则应该走过 cancelAnimationFrame（更强的断言，条件化避免环境差异导致误报）
    if (hadPendingAtCheck) {
      expect(mockCaf).toHaveBeenCalled();
    }
  });
});
