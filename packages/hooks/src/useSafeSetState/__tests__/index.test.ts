import { renderHook, act } from '@testing-library/react';
import useSafeSetState from '../index';

describe('useSafeSetState', () => {
  it('should behave like useState: set next state value', () => {
    const { result } = renderHook(() => useSafeSetState(0));

    act(() => {
      const [, setState] = result.current;
      setState(1);
    });

    expect(result.current[0]).toBe(1);
  });

  it('should behave like useState: functional update', () => {
    const { result } = renderHook(() => useSafeSetState(1));

    act(() => {
      const [, setState] = result.current;
      setState((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(2);
  });

  it('should call initializer function only once', () => {
    const init = jest.fn(() => 123);

    const { result, rerender } = renderHook(() => useSafeSetState(init));

    expect(init).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBe(123);

    rerender();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('should return a stable setter reference across rerenders', () => {
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => {
        const [state, setState] = useSafeSetState(0);
        return { n, state, setState };
      },
      { initialProps: { n: 0 } },
    );

    const firstSetter = result.current.setState;

    rerender({ n: 1 });
    expect(result.current.setState).toBe(firstSetter);

    rerender({ n: 2 });
    expect(result.current.setState).toBe(firstSetter);
  });

  it('should ignore updates after unmount (no unmounted setState warning)', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useSafeSetState(0));
    const [, setState] = result.current;

    unmount();

    // 组件卸载后尝试 setState 应该被拦截不报错
    expect(() => {
      setState(1);
    }).not.toThrow();

    const messages = errorSpy.mock.calls.map((args) => String(args[0] ?? ''));
    const hasUnmountWarning = messages.some((m) =>
      /unmounted component|state update on an unmounted component/i.test(m),
    );
    expect(hasUnmountWarning).toBe(false);

    errorSpy.mockRestore();
  });
});
