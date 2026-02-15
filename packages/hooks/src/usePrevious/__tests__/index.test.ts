import { renderHook } from '@testing-library/react';
import usePrevious from '../index';

describe('usePrevious', () => {
  //  1）默认行为：首次渲染时没有上一值，应返回 undefined
  it('should return undefined on first render by default', () => {
    const { result } = renderHook(() => usePrevious(1));
    expect(result.current).toBeUndefined();
  });

  //  2）首次渲染：传入 initialValue 时，应返回 initialValue 作为上一值
  it('should return initialValue on first render when provided', () => {
    const { result } = renderHook(() => usePrevious(1, { initialValue: 99 }));
    expect(result.current).toBe(99);
  });

  //  3）基础行为：多次 rerender 后应按顺序返回“上一轮渲染的 value”
  it('should return the previous value after rerenders', () => {
    const { result, rerender } = renderHook(({ value }: { value: number }) => usePrevious(value), {
      initialProps: { value: 1 },
    });

    // 当前为首次渲染，没有上一值
    expect(result.current).toBeUndefined();

    // value 变为 2 时，本次渲染读到的上一值应为 1
    rerender({ value: 2 });
    expect(result.current).toBe(1);

    // value 变为 3 时，本次渲染读到的上一值应为 2
    rerender({ value: 3 });
    expect(result.current).toBe(2);
  });

  //  4）条件更新：shouldUpdate 返回 false 时不更新内部记录，返回 true 时才更新
  it('should respect shouldUpdate and only update when predicate returns true', () => {
    const shouldUpdate = (_prev: number | undefined, next: number) => next % 2 === 0;

    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => usePrevious(value, { initialValue: 0, shouldUpdate }),
      { initialProps: { value: 1 } },
    );

    // 首次渲染应返回 initialValue
    expect(result.current).toBe(0);

    // value 变为 2：本次渲染读到的上一值仍为 0（随后 effect 才会把内部记录更新为 2）
    rerender({ value: 2 });
    expect(result.current).toBe(0);

    // value 变为 3：由于上次已记录为 2，本次渲染读到的上一值应为 2；且 3 为奇数不会更新记录
    rerender({ value: 3 });
    expect(result.current).toBe(2);

    // value 变为 5：仍为奇数，不更新记录，上一值仍应保持为 2
    rerender({ value: 5 });
    expect(result.current).toBe(2);

    // value 变为 6：本次渲染读到的上一值仍为 2（随后 effect 才会把内部记录更新为 6）
    rerender({ value: 6 });
    expect(result.current).toBe(2);

    // value 变为 7：由于上次已记录为 6，本次渲染读到的上一值应为 6
    rerender({ value: 7 });
    expect(result.current).toBe(6);
  });

  //  5）边界值：支持 null / undefined，并能正确记录上一轮的值
  it('should support null/undefined values', () => {
    interface Props {
      value: null | undefined;
    }

    const initialProps: Props = { value: null };
    const { result, rerender } = renderHook(({ value }: Props) => usePrevious(value), {
      initialProps,
    });

    // 首次渲染没有上一值
    expect(result.current).toBeUndefined();

    // value 变为 undefined 时，本次渲染读到的上一值应为 null
    rerender({ value: undefined });
    expect(result.current).toBeNull();

    // value 变回 null 时，本次渲染读到的上一值应为 undefined
    rerender({ value: null });
    expect(result.current).toBeUndefined();
  });
});
