// useRafScheduler.test.ts
import { act, renderHook } from '@testing-library/react';
import useRafScheduler from '../core/useRafScheduler';
import type { FrameDriver, FrameRequestId } from '../core/drivers';

jest.useFakeTimers(); // 模拟定时器（保持与其他单测风格一致）

/**
 * 创建一个可控的 mock FrameDriver：
 * - request(cb) 只会把 cb 放入“下一帧队列”
 * - fireNextFrame() 才会真正执行这一帧的队列（并且 snapshot+clear，保证“同帧只执行当时已挂起的回调”）
 * - cancel(id) 会把对应回调从队列中移除
 * - now() 由测试侧可控（setNow）
 */
function createMockDriver(options?: { type?: string }) {
  let idSeq = 0;
  let nowMs = 0;

  // 用 Map 保序：插入顺序就是 FIFO 执行顺序
  const pendingCallbacks = new Map<number, (frameTime: number) => void>();

  const stats = {
    requestCalls: 0,
    cancelCalls: 0,
    lastCanceledId: null as number | null,
  };

  const driver: FrameDriver = {
    type: options?.type ?? 'raf',
    now: () => nowMs,
    request: (cb) => {
      stats.requestCalls += 1;
      idSeq += 1;
      pendingCallbacks.set(idSeq, cb);
      return idSeq as unknown as FrameRequestId;
    },
    cancel: (id) => {
      stats.cancelCalls += 1;
      stats.lastCanceledId = id as unknown as number;
      pendingCallbacks.delete(id as unknown as number);
    },
  };

  const api = {
    driver,
    stats,
    setNow(ms: number) {
      nowMs = ms;
    },
    /**
     * 触发“下一帧”：
     * - snapshot 当前队列并清空
     * - 执行 snapshot（执行过程中如果又 request 了新的回调，会进入“下一帧队列”，不会在本次 fireNextFrame 中被执行）
     */
    fireNextFrame(frameTime?: number) {
      const snapshot = Array.from(pendingCallbacks.entries());
      pendingCallbacks.clear();

      for (const [, cb] of snapshot) {
        cb(frameTime ?? nowMs);
      }
    },
    /** 仅用于测试：当前是否还有待执行回调 */
    getPendingCount() {
      return pendingCallbacks.size;
    },
  };

  return api;
}

describe('useRafScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1) 同一帧内多次 schedule：默认 takeLatest（只执行最后一次）
  it('should take latest payload within the same frame (default merge=takeLatest)', () => {
    const { driver, setNow, fireNextFrame } = createMockDriver({ type: 'raf' });
    const invoke = jest.fn();

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver,
      }),
    );

    act(() => {
      result.current.schedule(1);
      result.current.schedule(2);
      result.current.schedule(3);
    });

    // 已挂起一帧任务
    expect(result.current.pending).toBe(true);
    expect(result.current.isPending()).toBe(true);
    expect(result.current.getLatestPayload()).toBe(3);

    act(() => {
      setNow(100);
      fireNextFrame(123); // RAF-like：会把 frameTime 透传到 meta.frameTime
    });

    // 只执行一次，且 payload 是最后一次
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        reason: 'frame',
        at: 100,
        frameTime: 123,
      }),
    );

    // pending 被正确清空
    expect(result.current.pending).toBe(false);
    expect(result.current.isPending()).toBe(false);
    expect(result.current.getLatestPayload()).toBe(undefined);
  });

  // 2) 自定义 merge：同一帧内多次 schedule 可实现“累计”语义（例如函数式更新累计）
  it('should support custom merge strategy (e.g. accumulate)', () => {
    const { driver, setNow, fireNextFrame } = createMockDriver({ type: 'raf' });
    const invoke = jest.fn();

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver,
        // merge: 累计
        merge: (prev, next) => prev + next,
      }),
    );

    act(() => {
      result.current.schedule(1);
      result.current.schedule(2);
      result.current.schedule(3);
    });

    expect(result.current.getLatestPayload()).toBe(6);

    act(() => {
      setNow(50);
      fireNextFrame(999);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      6,
      expect.objectContaining({
        reason: 'frame',
        at: 50,
        frameTime: 999,
      }),
    );
  });

  // 3) shouldSchedule：调度前守卫（例如 next 与 pending 等价时跳过一次调度）
  it('should respect shouldSchedule guard', () => {
    const mock = createMockDriver({ type: 'raf' });
    const invoke = jest.fn();

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver: mock.driver,
        // 当 next 与 pending 相同则跳过（不更新 payload，不新增 request）
        shouldSchedule: (pending, next) => pending !== next,
      }),
    );

    act(() => {
      result.current.schedule(1);
    });

    expect(mock.stats.requestCalls).toBe(1);
    expect(result.current.getLatestPayload()).toBe(1);

    act(() => {
      result.current.schedule(1); // shouldSchedule=false：不应改变 payload，也不应新增 request
    });

    expect(mock.stats.requestCalls).toBe(1);
    expect(result.current.getLatestPayload()).toBe(1);

    act(() => {
      result.current.schedule(2); // shouldSchedule=true：更新 payload
    });

    expect(mock.stats.requestCalls).toBe(1); // 仍然只有 1 个 tick（pending 期间不会再 request）
    expect(result.current.getLatestPayload()).toBe(2);

    act(() => {
      mock.setNow(10);
      mock.fireNextFrame(10);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(2, expect.objectContaining({ reason: 'frame' }));
  });

  // 4) flush：同步执行一次并清空 pending，同时撤销已挂起 tick，避免下一帧空跑
  it('should flush immediately with latest payload and cancel scheduled tick', () => {
    const mock = createMockDriver({ type: 'raf' });
    const invoke = jest.fn();

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver: mock.driver,
      }),
    );

    act(() => {
      result.current.schedule(1);
      result.current.schedule(2);
    });

    expect(result.current.pending).toBe(true);
    expect(mock.getPendingCount()).toBe(1);

    act(() => {
      mock.setNow(200);
      result.current.flush();
    });

    // flush 触发一次
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        reason: 'flush',
        at: 200,
        frameTime: undefined,
      }),
    );

    // pending 清空
    expect(result.current.pending).toBe(false);
    expect(result.current.getLatestPayload()).toBe(undefined);

    // 即便把“旧 tick 回调”强行执行（模拟极端情况），也不应再次触发 invoke
    act(() => {
      mock.setNow(300);
      mock.fireNextFrame(300);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  // 5) cancel：取消后永不触发
  it('should not invoke after cancel', () => {
    const mock = createMockDriver({ type: 'raf' });
    const invoke = jest.fn();

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver: mock.driver,
      }),
    );

    act(() => {
      result.current.schedule(1);
    });

    expect(result.current.pending).toBe(true);
    expect(mock.getPendingCount()).toBe(1);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.pending).toBe(false);
    expect(mock.getPendingCount()).toBe(0);

    act(() => {
      mock.fireNextFrame(1);
    });

    expect(invoke).not.toHaveBeenCalled();
  });

  // 6) flushOnCancel：cancel 时先 flush（保留可选语义）
  it('should flush on cancel when flushOnCancel=true', () => {
    const mock = createMockDriver({ type: 'raf' });
    const invoke = jest.fn();

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver: mock.driver,
        flushOnCancel: true,
      }),
    );

    act(() => {
      mock.setNow(10);
      result.current.schedule(1);
    });

    act(() => {
      mock.setNow(20);
      result.current.cancel(); // 语义：等价 flush
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        reason: 'flush',
        at: 20,
      }),
    );

    act(() => {
      mock.fireNextFrame(999);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  // 7) 自动清理：组件卸载时自动 dispose（取消已挂起 tick），避免卸载后还 invoke
  it('should cancel scheduled tick on unmount and never invoke afterwards', () => {
    const mock = createMockDriver({ type: 'raf' });
    const invoke = jest.fn();

    const { result, unmount } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver: mock.driver,
      }),
    );

    act(() => {
      result.current.schedule(1);
    });

    expect(mock.getPendingCount()).toBe(1);

    unmount();

    // 即便后续“帧”到来，也不应触发 invoke
    act(() => {
      mock.fireNextFrame(123);
    });

    expect(invoke).not.toHaveBeenCalled();
  });

  // 8) 条件执行（执行前二次检查）：shouldInvoke 返回 false 时，本次执行被丢弃并清空 pending
  it('should respect shouldInvoke pre-check and drop execution when it returns false', () => {
    const mock = createMockDriver({ type: 'raf' });
    const invoke = jest.fn();

    const shouldInvoke = jest.fn((payload: string) => payload !== 'skip');

    const { result } = renderHook(() =>
      useRafScheduler<string>(invoke, {
        driver: mock.driver,
        shouldInvoke,
      }),
    );

    act(() => {
      result.current.schedule('skip');
    });

    expect(result.current.pending).toBe(true);

    act(() => {
      mock.setNow(10);
      mock.fireNextFrame(10);
    });

    // shouldInvoke 被调用，但 invoke 被丢弃
    expect(shouldInvoke).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();

    // pending 应清空，且后续仍可继续 schedule
    expect(result.current.pending).toBe(false);

    act(() => {
      result.current.schedule('ok');
      mock.setNow(20);
      mock.fireNextFrame(20);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('ok', expect.objectContaining({ reason: 'frame', at: 20 }));
  });

  // 9) 错误隔离：单次 invoke 抛错不影响 scheduler 状态机与后续调度
  it('should isolate errors (invoke throws) and keep scheduler usable', () => {
    const mock = createMockDriver({ type: 'raf' });

    const onError = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    const invoke = jest.fn<void, []>(() => {
      throw new Error('boom');
    });

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver: mock.driver,
        onError,
      }),
    );

    act(() => {
      result.current.schedule(1);
    });

    expect(() => {
      act(() => {
        mock.setNow(10);
        mock.fireNextFrame(10);
      });
    }).not.toThrow();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);

    // 后续还能继续正常调度
    invoke.mockImplementation(() => undefined);

    act(() => {
      result.current.schedule(2);
      mock.setNow(20);
      mock.fireNextFrame(20);
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith(
      2,
      expect.objectContaining({
        reason: 'frame',
        at: 20,
      }),
    );
  });

  // 10) 时间监控：tick 内测量耗时，写入 meta.cost，超过阈值触发 warn
  it('should measure invoke cost and warn when exceeding threshold (monitor=true)', () => {
    const mock = createMockDriver({ type: 'raf' });

    const onWarn = jest.fn();

    const invoke = jest.fn((_payload: number, _meta: any) => {
      // 模拟“执行耗时”：在 invoke 内推进 driver.now 的时间
      mock.setNow(112);
    });

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver: mock.driver,
        monitor: true,
        warnThresholdMs: 6,
        onWarn,
      }),
    );

    act(() => {
      result.current.schedule(1);
    });

    act(() => {
      mock.setNow(100); // tick 开始时刻
      mock.fireNextFrame(100);
    });

    expect(invoke).toHaveBeenCalledTimes(1);

    const meta = invoke.mock.calls[0][1];
    // cost = end - start = 112 - 100
    expect(meta.cost).toBe(12);

    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cost: 12,
        threshold: 6,
      }),
    );
  });

  // 11) 批量更新：batch(run) 包裹 invoke 执行（React 18 多数场景自动批处理，这里提供注入口）
  it('should execute invoke inside batch wrapper when batch is provided', () => {
    const mock = createMockDriver({ type: 'raf' });

    let inBatch = false;

    const batch = jest.fn((run: () => void) => {
      inBatch = true;
      run();
      inBatch = false;
    });

    const invoke = jest.fn(() => {
      // 若不在 batch 中执行，说明 batch 口子没生效
      expect(inBatch).toBe(true);
    });

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver: mock.driver,
        batch,
      }),
    );

    act(() => {
      result.current.schedule(1);
      mock.fireNextFrame(1);
    });

    expect(batch).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  // 12) 帧率限制（单实例最小可行）：未满足 minInterval 时“跳帧”，保留 payload 并重挂下一帧
  it('should limit fps per instance (maxFps) by skipping frames and rescheduling', () => {
    const mock = createMockDriver({ type: 'raf' });
    const invoke = jest.fn();

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver: mock.driver,
        maxFps: 30, // minInterval ≈ 33.33ms
      }),
    );

    // 第一次：t=0 执行
    act(() => {
      mock.setNow(0);
      result.current.schedule(1);
      mock.fireNextFrame(0);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenLastCalledWith(1, expect.objectContaining({ at: 0 }));

    // 第二次：t=10 触发 tick，但应跳帧（不执行 invoke），并重挂下一帧
    act(() => {
      mock.setNow(10);
      result.current.schedule(2);
      mock.fireNextFrame(10);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    // 由于跳帧，应该仍然处于 pending（已经为下一帧重挂了 tick）
    expect(result.current.pending).toBe(true);

    // 第三次：t=40（满足间隔）执行最新 payload
    act(() => {
      mock.setNow(40);
      mock.fireNextFrame(40);
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith(2, expect.objectContaining({ at: 40 }));
    expect(result.current.pending).toBe(false);
  });

  // 13) 非 raf-like driver：frameTime 不应写入 meta（例如 timeout driver）
  it('should not set meta.frameTime when driver is not raf-like (e.g. timeout)', () => {
    const mock = createMockDriver({ type: 'timeout' });
    const invoke = jest.fn();

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver: mock.driver,
      }),
    );

    act(() => {
      mock.setNow(10);
      result.current.schedule(1);
      mock.fireNextFrame(999); // 即使传入 frameTime，也不应透传给 meta.frameTime（非 raf-like）
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        reason: 'frame',
        at: 10,
        frameTime: undefined,
      }),
    );
  });

  // 14) fallback='none' 等情况：driver.request 可能返回 0，scheduler 不应卡死在 pending=true
  it('should not get stuck when driver.request returns falsy id (e.g. fallback=none)', () => {
    // 这里直接造一个“request 返回 0”的 driver
    const driver: FrameDriver = {
      type: 'none',
      now: () => 0,
      request: () => 0 as unknown as FrameRequestId,
      cancel: jest.fn(),
    };

    const invoke = jest.fn();

    const { result } = renderHook(() =>
      useRafScheduler<number>(invoke, {
        driver,
      }),
    );

    act(() => {
      result.current.schedule(1);
    });

    // request 失败后应立即清理，避免 pending 卡死
    expect(result.current.pending).toBe(false);
    expect(result.current.isPending()).toBe(false);
    expect(result.current.getLatestPayload()).toBe(undefined);
    expect(invoke).not.toHaveBeenCalled();
  });
});
