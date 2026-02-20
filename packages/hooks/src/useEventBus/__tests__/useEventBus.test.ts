import { act, renderHook } from '@testing-library/react';
import createEventBus from '../hooks/createEventBus';
import useEventBus from '../hooks/useEventBus';

interface TestEvents {
  ping: number;
}

describe('useEventBus', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 1）应返回传入的同一个 bus 实例（薄入口：assert + return）
  it('should return the same bus instance', () => {
    const bus = createEventBus<TestEvents>();

    const { result } = renderHook(() => useEventBus(bus));

    expect(result.current).toBe(bus);
  });

  // 2）未传 bus 时应抛出明确错误（避免静默失败）
  it('should throw when bus instance is missing', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useEventBus<TestEvents>(null as any))).toThrow();

    errorSpy.mockRestore();
  });

  // 3）同一实例 rerender 时不应告警（引用稳定是正常用法）
  it('should not warn when rerender keeps the same bus instance', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = createEventBus<TestEvents>();

    const { rerender } = renderHook(({ currentBus }) => useEventBus(currentBus), {
      initialProps: { currentBus: bus },
    });

    act(() => {
      rerender({ currentBus: bus });
      rerender({ currentBus: bus });
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  // 4）开发环境下，挂载后若 bus 引用发生变化，应给出一次告警（避免刷屏）
  it('should warn once when bus instance changes after mount in dev mode', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const bus1 = createEventBus<TestEvents>();
    const bus2 = createEventBus<TestEvents>();
    const bus3 = createEventBus<TestEvents>();

    const { rerender } = renderHook(({ currentBus }) => useEventBus(currentBus), {
      initialProps: { currentBus: bus1 },
    });

    act(() => {
      rerender({ currentBus: bus2 });
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('useEventBus');

    // 再次变化也只告警一次
    act(() => {
      rerender({ currentBus: bus3 });
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  // 5）生产环境下，即使 bus 引用变化，也不应输出开发期告警
  it('should not warn when bus instance changes in production mode', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const bus1 = createEventBus<TestEvents>();
    const bus2 = createEventBus<TestEvents>();

    const { rerender } = renderHook(({ currentBus }) => useEventBus(currentBus), {
      initialProps: { currentBus: bus1 },
    });

    act(() => {
      rerender({ currentBus: bus2 });
    });

    expect(warnSpy).not.toHaveBeenCalled();

    process.env.NODE_ENV = prevNodeEnv;
  });

  // 6）返回的 bus 应可直接用于事件操作（证明 useEventBus 不改变实例行为）
  it('should preserve bus behavior after passing through useEventBus', () => {
    const bus = createEventBus<TestEvents>();
    const fn = jest.fn();

    const { result } = renderHook(() => useEventBus(bus));

    result.current.on('ping', fn);
    result.current.emit('ping', 42);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(42);
    expect(result.current.listenerCount('ping')).toBe(1);
  });
});
