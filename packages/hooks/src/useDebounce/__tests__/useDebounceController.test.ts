import useDebounceController from '../core/useDebounceController';
import { act, renderHook } from '@testing-library/react';

jest.useFakeTimers(); // 模拟定时器

describe('useDebounceController', () => {
  let invoke: jest.Mock;

  beforeEach(() => {
    invoke = jest.fn(); // 每次测试前清空 mock，确保每个测试都从干净的状态开始
  });

  // 每次测试后清空定时器，避免相互影响（尤其是 maxWait / trailing 的 timer）
  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  // 1) 基础 trailing 防抖：只执行最后一次
  it('should call invoke only once with the latest payload after delay', () => {
    const { result } = renderHook(() => useDebounceController(invoke, { delay: 100 }));

    act(() => {
      result.current.emit(1); // 触发第一次 emit，数据为 1
    });
    act(() => {
      result.current.emit(2); // 再次 emit，数据为 2
    });
    act(() => {
      result.current.emit(3); // 再次 emit，数据为 3
    });

    // 验证 pending 状态
    expect(result.current.pending).toBe(true);

    // 在延时期间，invoke 还没有被调用
    expect(invoke).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(100);
    });

    // 验证 invoke 只会被调用一次，且传入的是最后一个值 3
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(3, expect.objectContaining({ reason: 'trailing' }));

    // 验证 pending 状态
    expect(result.current.pending).toBe(false);
  });

  // 2) leading = true：首次立刻执行
  it('should call invoke immediately with the first payload if leading is true', () => {
    const { result } = renderHook(() =>
      useDebounceController(invoke, { delay: 100, leading: true }),
    );

    act(() => {
      result.current.emit(1); // 触发 emit，数据为 1
    });

    // 立刻调用 invoke，reason 应该是 'leading'
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(1, expect.objectContaining({ reason: 'leading' }));

    // 模拟时间流逝
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // 不应再额外调用 invoke
    expect(invoke).toHaveBeenCalledTimes(1);

    // 验证 pending 状态最终应复位
    expect(result.current.pending).toBe(false);
  });

  // 3) leading = true 且防抖期内有后续：末尾再执行一次 trailing
  it('should call invoke twice when leading is true and multiple emits occur', () => {
    const { result } = renderHook(() =>
      useDebounceController(invoke, { delay: 100, leading: true }),
    );

    act(() => {
      result.current.emit(1); // 触发第一次 emit，数据为 1
    });

    // 验证 pending 状态
    expect(result.current.pending).toBe(true);

    // 同时验证 invoke 被调用一次，传入的是值为 1
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(1, expect.objectContaining({ reason: 'leading' }));

    act(() => {
      result.current.emit(2); // 再次 emit，数据为 2
    });
    act(() => {
      result.current.emit(3); // 再次 emit，数据为 3
    });

    // 验证 pending 状态
    expect(result.current.pending).toBe(true);

    // 在延时期间，invoke 调用没有被更新
    expect(invoke).toHaveBeenCalledWith(1, expect.objectContaining({ reason: 'leading' }));

    act(() => {
      jest.advanceTimersByTime(100);
    });

    // 验证 invoke 只会被调用两次，且传入的是最后一个值 3
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith(3, expect.objectContaining({ reason: 'trailing' }));

    // 验证 pending 状态
    expect(result.current.pending).toBe(false);
  });

  // 4) cancel：取消后永不触发
  it('should not invoke after cancel', () => {
    const { result } = renderHook(() => useDebounceController(invoke, { delay: 100 }));

    act(() => {
      result.current.emit(1); // 触发 emit，数据为 1
    });

    // cancel 前 pending 应为 true
    expect(result.current.pending).toBe(true);

    act(() => {
      result.current.cancel(); // 取消当前的 debounce 调度
    });

    // cancel 后 pending 应立即复位为 false
    expect(result.current.pending).toBe(false);

    // 模拟时间流逝
    act(() => {
      jest.advanceTimersByTime(100); // 模拟 100 毫秒过去
    });

    // 取消后，不应触发 invoke
    expect(invoke).not.toHaveBeenCalled();
  });

  // 5) flush：立即执行最后一次并清空 pending
  it('should call invoke immediately on flush and clear pending', () => {
    const { result } = renderHook(() => useDebounceController(invoke, { delay: 100 }));

    act(() => {
      result.current.emit(1); // 触发第一次 emit，数据为 1
    });
    act(() => {
      result.current.emit(2); // 触发第二次 emit，数据为 2
    });

    // flush 前 pending 应为 true
    expect(result.current.pending).toBe(true);

    // 验证 flush 时立即调用 invoke
    act(() => {
      result.current.flush(); // 执行 flush
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(2, expect.objectContaining({ reason: 'flush' }));

    // flush 后 pending 应为 false
    expect(result.current.pending).toBe(false);

    // 模拟时间流逝
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // 不再触发 invoke，因为已执行过 flush
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  // 6) skipInitial：第一次 emit 完全忽略
  it('should ignore the first emit when skipInitial is true', () => {
    const { result } = renderHook(() =>
      useDebounceController(invoke, { delay: 100, skipInitial: true }),
    );

    act(() => {
      result.current.emit(1); // 触发第一次 emit，数据为 1
    });

    // 验证第一次 emit 被忽略
    expect(invoke).not.toHaveBeenCalled();

    // skipInitial：第一次 emit 应该“不 leading、不 trailing、不启动 pending”
    expect(result.current.pending).toBe(false);

    // 第一次 emit 被忽略，所以 lastPayload 也不应被写入
    expect(result.current.getLastPayload()).toBeUndefined();

    act(() => {
      result.current.emit(2); // 触发第二次 emit，数据为 2
    });

    // 第二次开始生效，应进入 pending
    expect(result.current.pending).toBe(true);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    // 验证第二次 emit 被调用
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(2, expect.objectContaining({ reason: 'trailing' }));
  });

  // 7) pending 状态语义（pending 在 emit 和 cancel 时的表现）
  it('should correctly handle pending state', () => {
    const { result } = renderHook(() => useDebounceController(invoke, { delay: 100 }));

    act(() => {
      result.current.emit(1); // 触发 emit，数据为 1
    });

    // 触发 emit 后，pending 应为 true
    expect(result.current.pending).toBe(true);

    act(() => {
      jest.advanceTimersByTime(100); // 模拟延时过去
    });

    // 延时过后，pending 应为 false
    expect(result.current.pending).toBe(false);
  });

  // 8) maxWait：连续频繁 emit，必须在 maxWait 到期时强制触发一次（reason=maxWait），且取 latest payload
  it('should invoke with reason=maxWait using latest payload when emits keep happening within delay', () => {
    const { result } = renderHook(() =>
      useDebounceController(invoke, { delay: 100, maxWait: 250 }),
    );

    act(() => {
      result.current.emit(1); // t=0
    });

    act(() => {
      jest.advanceTimersByTime(90); // t=90（< delay）
      result.current.emit(2);
    });

    act(() => {
      jest.advanceTimersByTime(90); // t=180（< delay）
      result.current.emit(3);
    });

    // 还没到 maxWait，不应触发（trailing 一直被重置，maxWait 也未到）
    expect(invoke).toHaveBeenCalledTimes(0);

    act(() => {
      jest.advanceTimersByTime(70); // t=250，maxWait 到期
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(3, expect.objectContaining({ reason: 'maxWait' }));

    // maxWait 触发后，后续 trailing timer 到期不应再重复 invoke（因为 payload 已被消费）
    act(() => {
      jest.advanceTimersByTime(40); // t=290（跨过 t=280 的 trailing 到期点）
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  // 9) trailing=false：leading=false 时，无论怎么 emit、怎么推进时间，都不应触发 invoke
  it('should never invoke when trailing is false and leading is false', () => {
    const { result } = renderHook(() =>
      useDebounceController(invoke, { delay: 100, trailing: false, leading: false }),
    );

    act(() => {
      result.current.emit(1);
      result.current.emit(2);
      result.current.emit(3);
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(invoke).not.toHaveBeenCalled();

    // 即使 trailing=false 导致没有 invoke，本轮 delay 到期也必须结束 cycle，pending 复位
    expect(result.current.pending).toBe(false);
  });

  // 10) leading=true 且只有一次 emit：flush 不应重复执行（避免 leading + flush 双触发）
  it('should not invoke again on flush if only leading has run and no later emits occurred', () => {
    const { result } = renderHook(() =>
      useDebounceController(invoke, { delay: 100, leading: true }),
    );

    act(() => {
      result.current.emit(1); // 立刻 leading
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(1, expect.objectContaining({ reason: 'leading' }));

    act(() => {
      result.current.flush(); // 不应重复执行
    });

    expect(invoke).toHaveBeenCalledTimes(1);

    // flush 会结束 cycle，所以 pending 应复位
    expect(result.current.pending).toBe(false);

    act(() => {
      jest.advanceTimersByTime(200); // 即使时间过去也不应 trailing
    });

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  // 11) skipInitial + leading=true：第一次 emit 完全忽略；第二次开始才会 leading
  it('should ignore first emit with skipInitial=true even when leading is true, then leading should run on second emit', () => {
    const { result } = renderHook(() =>
      useDebounceController(invoke, { delay: 100, leading: true, skipInitial: true }),
    );

    act(() => {
      result.current.emit(1); // 第一次应被忽略（不 leading、不 trailing、不 pending）
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);

    act(() => {
      result.current.emit(2); // 第二次才开始生效：应立刻 leading
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(2, expect.objectContaining({ reason: 'leading' }));
    expect(result.current.pending).toBe(true);
  });

  // 12) 回归用例：leading=true & trailing=false 时，delay 到期必须结束 cycle（pending 不应卡住）
  it('should reset pending after delay when leading is true and trailing is false (regression: pending should not stay true)', () => {
    const { result } = renderHook(() =>
      useDebounceController(invoke, { delay: 100, leading: true, trailing: false }),
    );

    act(() => {
      result.current.emit(1); // 立刻 leading
    });

    // 立刻调用 invoke
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(1, expect.objectContaining({ reason: 'leading' }));

    // 防抖期内 pending 应为 true
    expect(result.current.pending).toBe(true);

    act(() => {
      jest.advanceTimersByTime(100); // delay 到期，即使 trailing=false 也应结束 cycle
    });

    // 不应再额外调用 invoke
    expect(invoke).toHaveBeenCalledTimes(1);

    // pending 必须复位为 false
    expect(result.current.pending).toBe(false);
  });

  // 13) flush 边界：非 pending 状态下调用 flush 必须是 no-op
  it('should do nothing when flush is called while not pending', () => {
    const { result } = renderHook(() => useDebounceController(invoke, { delay: 100 }));

    // 此时没有 emit，pending=false
    expect(result.current.pending).toBe(false);

    act(() => {
      result.current.flush(); // 不应报错、不应触发 invoke
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  // 14) getLastPayload：应始终返回最新 payload（trailing 前后都一致）
  it('should return latest payload via getLastPayload', () => {
    const { result } = renderHook(() => useDebounceController(invoke, { delay: 100 }));

    act(() => {
      result.current.emit(1);
    });
    expect(result.current.getLastPayload()).toBe(1);

    act(() => {
      result.current.emit(2);
    });
    expect(result.current.getLastPayload()).toBe(2);

    act(() => {
      result.current.emit(3);
    });
    expect(result.current.getLastPayload()).toBe(3);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    // trailing 执行后 lastPayloadRef 不会被清空，仍应返回最后一次 payload
    expect(result.current.getLastPayload()).toBe(3);
  });

  // 15) useLatestRef：pending 期间更新 invoke，trailing 应调用最新 invoke（避免旧闭包）
  it('should call the latest invoke for trailing even if invoke changes during pending', () => {
    const invoke1 = jest.fn();
    const invoke2 = jest.fn();

    const { result, rerender } = renderHook(
      ({ inv }: { inv: jest.Mock }) => useDebounceController(inv, { delay: 100 }),
      { initialProps: { inv: invoke1 } },
    );

    act(() => {
      result.current.emit(1); // 开始 pending
    });

    // pending 期间切换 invoke
    act(() => {
      rerender({ inv: invoke2 });
    });

    act(() => {
      jest.advanceTimersByTime(100); // trailing 触发
    });

    expect(invoke1).not.toHaveBeenCalled();
    expect(invoke2).toHaveBeenCalledTimes(1);
    expect(invoke2).toHaveBeenCalledWith(1, expect.objectContaining({ reason: 'trailing' }));
  });

  // 16) useLatestRef：pending 期间更新 options（例如 trailing 改为 false），到点不应再 trailing invoke，但仍应结束 cycle
  it('should respect latest options during pending (toggle trailing off should prevent trailing invoke)', () => {
    const { result, rerender } = renderHook(
      ({ trailing }: { trailing: boolean }) =>
        useDebounceController(invoke, { delay: 100, trailing, leading: false }),
      { initialProps: { trailing: true } },
    );

    act(() => {
      result.current.emit(1); // 开始 pending，原本会 trailing
    });

    // pending 期间把 trailing 关掉
    act(() => {
      rerender({ trailing: false });
    });

    act(() => {
      jest.advanceTimersByTime(100); // delay 到期
    });

    // trailing 被关闭，不应触发 invoke
    expect(invoke).not.toHaveBeenCalled();

    // 但 cycle 仍应结束，pending 复位
    expect(result.current.pending).toBe(false);
  });

  // 17) maxWait 组合：leading 已消费唯一 payload 时，maxWait 到期不应额外触发（避免重复副作用）
  it('should not invoke on maxWait if only leading has consumed the payload and no later emits occurred', () => {
    const { result } = renderHook(() =>
      useDebounceController(invoke, { delay: 100, maxWait: 50, leading: true, trailing: true }),
    );

    act(() => {
      result.current.emit(1); // 立刻 leading，并消费 payload
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(1, expect.objectContaining({ reason: 'leading' }));

    act(() => {
      jest.advanceTimersByTime(50); // maxWait 到期
    });

    // 不应额外触发 maxWait
    expect(invoke).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(100); // delay 到期，结束 cycle（trailing 不应执行）
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  // 18) delay 归一化：delay<0 会被 clamp 到 0（至少 smoke 覆盖一次）
  it('should clamp negative delay to 0 (trailing should run immediately)', () => {
    const { result } = renderHook(() => useDebounceController(invoke, { delay: -10 }));

    act(() => {
      result.current.emit(1);
    });

    // delay 被 clamp 到 0，推进 0ms 应触发 trailing
    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(1, expect.objectContaining({ reason: 'trailing' }));
    expect(result.current.pending).toBe(false);
  });

  // 19) unmount：卸载时自动 cancel，后续推进时间不应再 invoke（避免泄漏/卸载后副作用）
  it('should cancel timers on unmount and never invoke afterwards', () => {
    const { result, unmount } = renderHook(() => useDebounceController(invoke, { delay: 100 }));

    act(() => {
      result.current.emit(1); // 开始 pending
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(invoke).not.toHaveBeenCalled();
  });
});
