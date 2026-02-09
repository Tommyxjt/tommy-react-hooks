import { renderHook } from '@testing-library/react';
import useStableCallback from '../index';

describe('useStableCallback', () => {
  it('should return a stable function reference across rerenders', () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();

    const { result, rerender } = renderHook(
      ({ fn }: { fn: (...args: any[]) => any }) => useStableCallback(fn),
      { initialProps: { fn: fn1 } },
    );

    const stable = result.current;

    rerender({ fn: fn2 });
    expect(result.current).toBe(stable);

    rerender({ fn: fn1 });
    expect(result.current).toBe(stable);
  });

  it('should always call the latest fn after rerender', () => {
    const fn1 = jest.fn(() => 'fn1');
    const fn2 = jest.fn(() => 'fn2');

    const { result, rerender } = renderHook(
      ({ fn }: { fn: () => string }) => useStableCallback(fn),
      { initialProps: { fn: fn1 } },
    );

    const stable = result.current;

    expect(stable()).toBe('fn1');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(0);

    rerender({ fn: fn2 });

    // 函数引用应当始终保持稳定
    expect(result.current).toBe(stable);

    // 但是函数本身应当同步至最新
    expect(stable()).toBe('fn2');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('should forward arguments and return the latest fn result', () => {
    const fn1 = jest.fn((a: number, b: number) => a + b);
    const fn2 = jest.fn((a: number, b: number) => a * b);

    const { result, rerender } = renderHook(
      ({ fn }: { fn: (a: number, b: number) => number }) => useStableCallback(fn),
      { initialProps: { fn: fn1 } },
    );

    const stable = result.current;

    expect(stable(2, 3)).toBe(5);
    expect(fn1).toHaveBeenLastCalledWith(2, 3);

    rerender({ fn: fn2 });

    expect(stable(2, 3)).toBe(6);
    expect(fn2).toHaveBeenLastCalledWith(2, 3);
  });
});
