import { renderHook, act } from '@testing-library/react';
import useForceUpdate from '../index';

describe('useForceUpdate', () => {
  it('should return a function', () => {
    const { result } = renderHook(() => useForceUpdate());
    expect(typeof result.current).toBe('function');
  });

  it('should return a stable function reference across rerenders', () => {
    const { result, rerender } = renderHook((_unusedProps: { n: number }) => useForceUpdate(), {
      initialProps: { n: 0 },
    });

    const forceUpdate = result.current;

    rerender({ n: 1 });
    expect(result.current).toBe(forceUpdate);

    rerender({ n: 2 });
    expect(result.current).toBe(forceUpdate);
  });

  it('should trigger rerender when called', () => {
    let renders = 0;

    const { result } = renderHook(() => {
      renders += 1;
      return useForceUpdate();
    });

    const forceUpdate = result.current;

    // 首次 render
    expect(renders).toBe(1);

    act(() => {
      forceUpdate();
    });

    // forceUpdate 引起的第二次 render
    expect(renders).toBe(2);

    act(() => {
      forceUpdate();
      forceUpdate();
    });

    expect(renders).toBe(4);
  });
});
