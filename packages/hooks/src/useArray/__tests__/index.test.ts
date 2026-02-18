import { act, renderHook } from '@testing-library/react';
import useArray, { MutableReactiveArray } from '../index';

describe('useArray', () => {
  //  1）基础能力：Array.isArray / instanceof Array / 原型链对齐
  it('should behave like a native array in type checks', () => {
    const { result } = renderHook(() => useArray(['a', 'b'], { mode: 'immutable' } as any));

    expect(Array.isArray(result.current)).toBe(true);
    expect(result.current instanceof Array).toBe(true);
    expect(Object.getPrototypeOf(result.current)).toBe(Array.prototype);
  });

  //  2）基础能力：支持迭代（Symbol.iterator）与展开/Array.from
  it('should support iteration and spread', () => {
    const { result } = renderHook(() => useArray(['a', 'b', 'c'], { mode: 'immutable' } as any));

    expect(Array.from(result.current)).toEqual(['a', 'b', 'c']);
    expect([...result.current]).toEqual(['a', 'b', 'c']);

    const out: string[] = [];
    for (const v of result.current) out.push(v);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  //  3）immutable：首次渲染应返回数组，并能正确读取 length 与下标
  it('should expose correct length and index access in immutable mode', () => {
    const { result } = renderHook(() => useArray(['a', 'b'], { mode: 'immutable' } as any));

    expect(result.current.length).toBe(2);
    expect(result.current[0]).toBe('a');
    expect(result.current[1]).toBe('b');
  });

  //  4）immutable：支持原生写法 arr[i] = x，并返回新引用（便于 deps/memo）
  it('should support index assignment and return a new reference in immutable mode', () => {
    const { result } = renderHook(() => useArray(['a', 'b'], { mode: 'immutable' } as any));
    const first = result.current;

    act(() => {
      result.current[0] = 'x';
    });

    expect(result.current).not.toBe(first);
    expect(result.current.toArray()).toEqual(['x', 'b']);
  });

  //  5）immutable：支持原生写法 arr.length = 0（清空）
  it('should support setting length to truncate in immutable mode', () => {
    const { result } = renderHook(() => useArray(['a', 'b', 'c'], { mode: 'immutable' } as any));
    const first = result.current;

    act(() => {
      result.current.length = 0;
    });

    expect(result.current).not.toBe(first);
    expect(result.current.length).toBe(0);
    expect(result.current.toArray()).toEqual([]);
  });

  //  6）immutable：支持 length 扩容并产生 holes（空槽语义）
  it('should support expanding length and preserve holes semantics in immutable mode', () => {
    const { result } = renderHook(() => useArray([], { mode: 'immutable' } as any));
    const first = result.current;

    act(() => {
      result.current.length = 3;
    });

    expect(result.current).not.toBe(first);
    expect(result.current.length).toBe(3);
    // holes：读出来是 undefined，但 “in” 为 false
    expect(result.current[0]).toBeUndefined();
    expect(0 in result.current).toBe(false);
    expect(Object.keys(result.current)).toEqual([]);
  });

  //  7）immutable：支持 delete arr[i] 形成 holes，并且 “in / keys / descriptor” 语义对齐
  it('should support delete to create holes and keep reflective semantics in immutable mode', () => {
    const { result } = renderHook(() => useArray(['a', 'b', 'c'], { mode: 'immutable' } as any));

    act(() => {
      delete (result.current as any)[1];
    });

    expect(result.current.length).toBe(3);
    expect(result.current[1]).toBeUndefined();
    expect(1 in result.current).toBe(false);
    expect(Object.keys(result.current)).toEqual(['0', '2']);

    const d1 = Object.getOwnPropertyDescriptor(result.current, '1');
    expect(d1).toBeUndefined();

    const d0 = Object.getOwnPropertyDescriptor(result.current, '0');
    expect(d0?.enumerable).toBe(true);
    expect(d0?.writable).toBe(true);
    expect(d0?.configurable).toBe(true);
    expect(d0?.value).toBe('a');
  });

  //  8）immutable：batch 多步修改只触发一次更新，并返回新引用
  it('should batch multiple mutations into one update in immutable mode', () => {
    const { result } = renderHook(() => useArray([1, 2, 3, 4], { mode: 'immutable' } as any));
    const first = result.current;

    act(() => {
      result.current.batch((draft) => {
        draft[0] = 10;
        draft.pop();
        draft.push(4);
      });
    });

    expect(result.current).not.toBe(first);
    // 优先用 toArray：确保对第三方深比较更稳定
    expect(result.current.toArray()).toEqual([10, 2, 3, 4]);
  });

  //  9）mutable：首次渲染应包含 getVersion，并返回初始版本号
  it('should expose getVersion with initial version in mutable mode', () => {
    const { result } = renderHook(() => useArray(['a'], { mode: 'mutable' } as any));

    expect(typeof (result.current as any).getVersion).toBe('function');
    expect((result.current as any).getVersion()).toBe(0);
  });

  //  10）mutable：内容变化时引用保持稳定，但 version 递增
  it('should keep the same reference and bump version on change in mutable mode', () => {
    const { result } = renderHook(() => useArray(['a', 'b'], { mode: 'mutable' } as any));
    const first = result.current;
    const v0 = (result.current as unknown as MutableReactiveArray<string>).getVersion();

    act(() => {
      result.current.push('c');
    });

    expect(result.current).toBe(first);
    expect((result.current as unknown as MutableReactiveArray<string>).getVersion()).toBe(v0 + 1);
    expect(result.current.toArray()).toEqual(['a', 'b', 'c']);
  });

  //  11）mutable：写入相同值（且该索引原本存在）应视为 no-op，不 bump version
  it('should not bump version on no-op index assignment in mutable mode', () => {
    const { result } = renderHook(() => useArray(['a', 'b'], { mode: 'mutable' } as any));

    // 先制造一个“确定存在”的索引
    act(() => {
      result.current[0] = 'x';
    });

    const v1 = (result.current as any).getVersion();

    // 再写入相同值：应当 no-op
    act(() => {
      result.current[0] = 'x';
    });

    expect((result.current as any).getVersion()).toBe(v1);
  });

  //  12）mutable：batch 多步修改应只 bump 一次 version，并只触发一次 rerender
  it('should batch multiple mutations into one update in mutable mode', () => {
    let renderCount = 0;

    const { result } = renderHook(() => {
      renderCount += 1;
      return useArray([1, 2, 3], { mode: 'mutable' } as any);
    });

    const first = result.current;
    const rendersBefore = renderCount;
    const v0 = (result.current as unknown as MutableReactiveArray<string>).getVersion();

    act(() => {
      result.current.batch((draft) => {
        draft[0] = 10;
        draft.push(4);
        draft.splice(1, 1); // [10, 3, 4]
      });
    });

    expect(result.current).toBe(first);
    expect((result.current as unknown as MutableReactiveArray<string>).getVersion()).toBe(v0 + 1);
    expect(result.current.toArray()).toEqual([10, 3, 4]);

    // 只应触发一次 rerender
    expect(renderCount).toBe(rendersBefore + 1);
  });

  //  13）反射能力：Object.keys / Reflect.ownKeys 能看到真实数组的 keys（覆盖 Jest deepEqual 场景）
  it('should expose proper reflective keys for deep equal / serialization', () => {
    const { result } = renderHook(() => useArray(['a', 'b'], { mode: 'immutable' } as any));

    expect(Object.keys(result.current)).toEqual(['0', '1']);
    const keys = Reflect.ownKeys(result.current);
    expect(keys.includes('0')).toBe(true);
    expect(keys.includes('1')).toBe(true);
    expect(keys.includes('length')).toBe(true);

    const lenDesc = Object.getOwnPropertyDescriptor(result.current, 'length');
    expect(lenDesc?.enumerable).toBe(false);
    expect(lenDesc?.writable).toBe(true);
  });
});
