import { renderHook } from '@testing-library/react';
import useIsMounted from '../index';

describe('useIsMounted', () => {
  it('should return a function', () => {
    const { result } = renderHook(() => useIsMounted());
    expect(typeof result.current).toBe('function');
  });

  it('should return a stable function reference across rerenders', () => {
    const { result, rerender } = renderHook((_unusedProps: { n: number }) => useIsMounted(), {
      initialProps: { n: 0 },
    });

    const fn = result.current;

    rerender({ n: 1 });
    expect(result.current).toBe(fn);

    rerender({ n: 2 });
    expect(result.current).toBe(fn);
  });

  it('should be true after mounted and false after unmount', () => {
    const { result, unmount } = renderHook(() => useIsMounted());

    const isMounted = result.current;

    expect(isMounted()).toBe(true);

    unmount();

    expect(() => {
      isMounted();
    }).not.toThrow();

    expect(isMounted()).toBe(false);
  });
});
