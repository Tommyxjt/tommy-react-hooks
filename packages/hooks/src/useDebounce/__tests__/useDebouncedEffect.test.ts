import { act, renderHook } from '@testing-library/react';
import type { EffectCallback } from 'react';
import useDebouncedEffect from '../hooks/useDebouncedEffect'; // 按你的目录结构调整

describe('useDebouncedEffect', () => {
  // 每个用例都使用 fakeTimers，便于精确控制 debounce 的时间推进
  beforeEach(() => {
    jest.useFakeTimers();
  });

  // 每个用例结束后清理 mock，并恢复真实定时器，避免用例之间互相污染
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // 1) mount 时的基础行为：skipInitial 默认为 false，因此会在 mount 时调度一次，
  //    并在 delay 到期后执行 effect（trailing debounce）
  it('should invoke effect after delay on mount (skipInitial=false by default)', () => {
    const effect = jest.fn();

    renderHook(() => useDebouncedEffect(effect as unknown as EffectCallback, [], { delay: 100 }));

    // mount 后不会立刻执行（需要等待 delay）
    expect(effect).toHaveBeenCalledTimes(0);

    act(() => {
      jest.advanceTimersByTime(99);
    });
    // delay 未到，仍不执行
    expect(effect).toHaveBeenCalledTimes(0);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    // delay 刚好到期，执行一次
    expect(effect).toHaveBeenCalledTimes(1);
  });

  // 2) “只保留最后一次”：在 delay 窗口期内多次 deps 变化，会不断取消旧调度并重新调度，
  //    最终只执行最后一次调度对应的 effect
  it('should keep only the last one when deps change multiple times within delay', () => {
    const effect = jest.fn();

    const { rerender } = renderHook(
      ({ dep }) => useDebouncedEffect(effect as unknown as EffectCallback, [dep], { delay: 100 }),
      { initialProps: { dep: 0 } },
    );

    // t=0 已调度一次（预期在 t=100 执行）

    act(() => {
      jest.advanceTimersByTime(60); // t=60（仍在第一轮窗口期内）
    });

    // deps 变化：会 cancel 上一轮尚未触发的调度，并重新调度（预期在 t=160 执行）
    rerender({ dep: 1 });

    act(() => {
      jest.advanceTimersByTime(60); // t=120（仍在第二轮窗口期内）
    });

    // deps 再变化：再次 cancel 再调度（预期在 t=220 执行）
    rerender({ dep: 2 });

    act(() => {
      jest.advanceTimersByTime(99); // t=219（还差 1ms）
    });
    // 还没到最终那次的触发点，不应执行
    expect(effect).toHaveBeenCalledTimes(0);

    act(() => {
      jest.advanceTimersByTime(1); // t=220（最终触发点）
    });
    // 只执行一次（对应最后一次 dep=2 的调度）
    expect(effect).toHaveBeenCalledTimes(1);
  });

  // 3) effect 更新：即使在 pending 期间 rerender 更新了 effect，
  //    最终真正执行时也应调用“最新的 effect”（useLatestRef 防旧闭包）
  it('should always call the latest effect after rerender when pending', () => {
    const effect1 = jest.fn();
    const effect2 = jest.fn();

    const { rerender } = renderHook(
      ({ effect }) => useDebouncedEffect(effect, [], { delay: 100 }),
      { initialProps: { effect: effect1 as unknown as EffectCallback } },
    );

    // pending 期间更新 effect（deps 不变，不会重新调度，但 effectRef 会更新）
    rerender({ effect: effect2 as unknown as EffectCallback });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    // 最终应调用最新的 effect2，而不是旧的 effect1
    expect(effect1).not.toHaveBeenCalled();
    expect(effect2).toHaveBeenCalledTimes(1);
  });

  // 4) cleanup 语义：下一次“真正执行 effect”之前，必须先执行上一次 effect 返回的 cleanup，
  //    以贴近原生 useEffect 的行为（cleanup -> next effect）
  it('should run previous cleanup right before the next executed effect', () => {
    const calls: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    const cleanup1 = jest.fn<void, []>(() => {
      calls.push('cleanup1');
    });

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    const cleanup2 = jest.fn<void, []>(() => {
      calls.push('cleanup2');
    });

    let idx = 0;

    const effect = jest.fn<ReturnType<EffectCallback>, Parameters<EffectCallback>>(
      (): ReturnType<EffectCallback> => {
        idx += 1; // 1-based
        calls.push(`effect${idx}`);
        // 第一次返回 cleanup1，第二次返回 cleanup2
        return idx === 1 ? cleanup1 : cleanup2;
      },
    );

    const { rerender } = renderHook(
      ({ dep }) => useDebouncedEffect(effect as unknown as EffectCallback, [dep], { delay: 100 }),
      { initialProps: { dep: 0 } },
    );

    act(() => {
      jest.advanceTimersByTime(100); // 触发第 1 次执行
    });
    // 第一次只会执行 effect1，不会提前执行 cleanup
    expect(calls).toEqual(['effect1']);
    expect(cleanup1).toHaveBeenCalledTimes(0);

    // deps 变化：调度第 2 次执行
    rerender({ dep: 1 });

    act(() => {
      jest.advanceTimersByTime(100); // 触发第 2 次执行
    });

    // 第 2 次 effect 执行前，应先 cleanup1，再 effect2（贴近 useEffect）
    expect(calls).toEqual(['effect1', 'cleanup1', 'effect2']);
    expect(cleanup1).toHaveBeenCalledTimes(1);
    expect(cleanup2).toHaveBeenCalledTimes(0);
  });

  // 5) skipInitial=true：只跳过 mount 时那一次调度/执行；
  //    之后 deps 变化仍然会进入 debounce 并在 delay 到期后执行
  it('should skip initial schedule when skipInitial=true, but run on later deps change', () => {
    const effect = jest.fn();

    const { rerender } = renderHook(
      ({ dep }) =>
        useDebouncedEffect(effect as unknown as EffectCallback, [dep], {
          delay: 100,
          skipInitial: true,
        }),
      { initialProps: { dep: 0 } },
    );

    // mount 时应被跳过：即使时间过去也不应执行
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(effect).toHaveBeenCalledTimes(0);

    // deps 变化后才会调度并执行
    rerender({ dep: 1 });

    act(() => {
      jest.advanceTimersByTime(99);
    });
    // delay 未到，不应执行
    expect(effect).toHaveBeenCalledTimes(0);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    // delay 到期，执行一次
    expect(effect).toHaveBeenCalledTimes(1);
  });

  // 6) 卸载取消：如果还在 pending 且尚未执行，unmount 后必须取消调度，
  //    后续推进时间也不应再触发 effect（避免卸载后副作用）
  it('should cancel pending invocation on unmount (no effect called)', () => {
    const effect = jest.fn();

    const { unmount } = renderHook(() =>
      useDebouncedEffect(effect as unknown as EffectCallback, [], { delay: 100 }),
    );

    act(() => {
      jest.advanceTimersByTime(50); // 还在 delay 窗口期内
    });

    // 在触发点前卸载：应取消 pending
    unmount();

    act(() => {
      jest.advanceTimersByTime(200); // 即使时间过去也不应再执行
    });

    expect(effect).toHaveBeenCalledTimes(0);
  });

  // 7) 卸载 cleanup：如果 effect 已经真正执行过并返回 cleanup，
  //    那么 unmount 时应执行最后一次 cleanup（贴近 useEffect）
  it('should run last cleanup on unmount after effect executed', () => {
    const cleanup = jest.fn();
    const effect = jest.fn(() => cleanup);

    const { unmount } = renderHook(() =>
      useDebouncedEffect(effect as unknown as EffectCallback, [], { delay: 100 }),
    );

    act(() => {
      jest.advanceTimersByTime(100); // 触发执行
    });
    expect(effect).toHaveBeenCalledTimes(1);
    // 执行 effect 本身不会立刻执行 cleanup
    expect(cleanup).toHaveBeenCalledTimes(0);

    // 卸载时才会执行 cleanup
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
