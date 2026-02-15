import { act, renderHook } from '@testing-library/react';
import useMap from '../index';

describe('useMap', () => {
  //  1）immutable：首次渲染应返回初始数据（可读）
  it('should return initial entries in immutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, string>(
        [
          ['a', 'apple'],
          ['b', 'banana'],
        ],
        { mode: 'immutable' },
      ),
    );

    expect(result.current.size).toBe(2);
    expect(result.current.get('a')).toBe('apple');
    expect(result.current.get('b')).toBe('banana');
    expect(result.current.has('c')).toBe(false);
  });

  //  2）immutable：set 触发更新后应产生新引用，并且可读到最新值
  it('should create a new reference after set in immutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, string>([['a', 'apple']], { mode: 'immutable' }),
    );

    const first = result.current;
    expect(first.get('a')).toBe('apple');

    act(() => {
      result.current.set('a', 'apricot');
    });

    const second = result.current;
    expect(second.get('a')).toBe('apricot');
    expect(second).not.toBe(first);
  });

  //  3）immutable：set 相同值应 no-op（引用不变，数据不变）
  it('should be a no-op when setting the same value in immutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, string>([['a', 'apple']], { mode: 'immutable' }),
    );

    const first = result.current;
    expect(first.get('a')).toBe('apple');

    act(() => {
      result.current.set('a', 'apple');
    });

    const second = result.current;
    expect(second.get('a')).toBe('apple');
    expect(second).toBe(first);
  });

  //  4）immutable：同一 tick 连续调用 set 后 delete，应按顺序生效（最终不应存在该 key）
  it('should apply sequential operations in the same tick in immutable mode', () => {
    const { result } = renderHook(() => useMap<string, number>([], { mode: 'immutable' }));

    act(() => {
      result.current.set('a', 1);
      result.current.delete('a');
    });

    expect(result.current.has('a')).toBe(false);
    expect(result.current.get('a')).toBeUndefined();
    expect(result.current.size).toBe(0);
  });

  //  5）immutable：batchSet 为增量写入（保留未覆盖的 key，并更新/新增覆盖的 key）
  it('should patch entries with batchSet in immutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, string>(
        [
          ['a', '1'],
          ['b', '2'],
        ],
        { mode: 'immutable' },
      ),
    );

    act(() => {
      result.current.batchSet([
        ['b', '20'],
        ['c', '3'],
      ]);
    });

    expect(result.current.size).toBe(3);
    expect(result.current.get('a')).toBe('1');
    expect(result.current.get('b')).toBe('20');
    expect(result.current.get('c')).toBe('3');
  });

  //  6）immutable：replace 为整体替换（不在 next 中的 key 应被移除）
  it('should replace all entries with replace in immutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, string>(
        [
          ['a', '1'],
          ['b', '2'],
          ['c', '3'],
        ],
        { mode: 'immutable' },
      ),
    );

    act(() => {
      result.current.replace([
        ['x', '10'],
        ['y', '20'],
      ]);
    });

    expect(result.current.size).toBe(2);
    expect(result.current.has('a')).toBe(false);
    expect(result.current.has('b')).toBe(false);
    expect(result.current.has('c')).toBe(false);
    expect(result.current.get('x')).toBe('10');
    expect(result.current.get('y')).toBe('20');
  });

  //  7）immutable：reset 应回到初始化快照
  it('should reset to the initial snapshot in immutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, string>(
        [
          ['a', 'apple'],
          ['b', 'banana'],
        ],
        { mode: 'immutable' },
      ),
    );

    act(() => {
      result.current.set('a', 'apricot');
      result.current.delete('b');
      result.current.set('c', 'cherry');
    });

    expect(result.current.get('a')).toBe('apricot');
    expect(result.current.has('b')).toBe(false);
    expect(result.current.get('c')).toBe('cherry');

    act(() => {
      result.current.reset();
    });

    expect(result.current.size).toBe(2);
    expect(result.current.get('a')).toBe('apple');
    expect(result.current.get('b')).toBe('banana');
    expect(result.current.has('c')).toBe(false);
  });

  //  8）mutable：首次渲染应包含 getVersion，并返回初始版本号
  it('should provide getVersion in mutable mode', () => {
    const { result } = renderHook(() => useMap<string, number>([['a', 1]], { mode: 'mutable' }));

    expect(typeof (result.current as any).getVersion).toBe('function');
    expect((result.current as any).getVersion()).toBe(0);
    expect(result.current.get('a')).toBe(1);
  });

  //  9）mutable：引用应保持稳定，变更时 version 递增
  it('should keep a stable reference and bump version on changes in mutable mode', () => {
    const { result } = renderHook(() => useMap<string, number>([['a', 1]], { mode: 'mutable' }));

    const first = result.current;
    const v0 = (result.current as any).getVersion();
    expect(v0).toBe(0);

    act(() => {
      result.current.set('a', 2);
    });

    const second = result.current;
    const v1 = (result.current as any).getVersion();

    expect(second).toBe(first);
    expect(result.current.get('a')).toBe(2);
    expect(v1).toBe(1);
  });

  //  10）mutable：set 相同值应 no-op（version 不变）
  it('should not bump version when setting the same value in mutable mode', () => {
    const { result } = renderHook(() => useMap<string, number>([['a', 1]], { mode: 'mutable' }));

    const v0 = (result.current as any).getVersion();
    expect(v0).toBe(0);

    act(() => {
      result.current.set('a', 1);
    });

    const v1 = (result.current as any).getVersion();
    expect(v1).toBe(0);
    expect(result.current.get('a')).toBe(1);
  });

  //  11）mutable：batchSet 应支持增量写入，并且对已有 key 做更新
  it('should patch entries with batchSet in mutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, number>(
        [
          ['a', 1],
          ['b', 2],
        ],
        { mode: 'mutable' },
      ),
    );

    act(() => {
      result.current.batchSet([
        ['b', 20],
        ['c', 3],
      ]);
    });

    expect(result.current.size).toBe(3);
    expect(result.current.get('a')).toBe(1);
    expect(result.current.get('b')).toBe(20);
    expect(result.current.get('c')).toBe(3);
    expect((result.current as any).getVersion()).toBe(1);
  });

  //  12）mutable：replace 应整体替换，并触发 version 递增
  it('should replace all entries with replace in mutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, number>(
        [
          ['a', 1],
          ['b', 2],
        ],
        { mode: 'mutable' },
      ),
    );

    act(() => {
      result.current.replace([
        ['x', 10],
        ['y', 20],
      ]);
    });

    expect(result.current.size).toBe(2);
    expect(result.current.has('a')).toBe(false);
    expect(result.current.has('b')).toBe(false);
    expect(result.current.get('x')).toBe(10);
    expect(result.current.get('y')).toBe(20);
    expect((result.current as any).getVersion()).toBe(1);
  });

  //  13）mutable：reset 应回到初始化快照，并触发 version 递增
  it('should reset to the initial snapshot in mutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, number>(
        [
          ['a', 1],
          ['b', 2],
        ],
        { mode: 'mutable' },
      ),
    );

    act(() => {
      result.current.set('a', 10);
      result.current.delete('b');
      result.current.set('c', 3);
    });

    expect(result.current.get('a')).toBe(10);
    expect(result.current.has('b')).toBe(false);
    expect(result.current.get('c')).toBe(3);
    expect((result.current as any).getVersion()).toBe(3);

    act(() => {
      result.current.reset();
    });

    expect(result.current.size).toBe(2);
    expect(result.current.get('a')).toBe(1);
    expect(result.current.get('b')).toBe(2);
    expect(result.current.has('c')).toBe(false);
    expect((result.current as any).getVersion()).toBe(4);
  });

  //  14）index：mode 只在首帧读取一次，后续 rerender 改 mode 不应改变实现路径
  it('should freeze mode on first render and ignore mode changes on rerender', () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: 'mutable' | 'immutable' }) =>
        useMap<string, number>([['a', 1]], { mode } as any),
      { initialProps: { mode: 'mutable' } },
    );

    expect(typeof (result.current as any).getVersion).toBe('function');
    expect((result.current as any).getVersion()).toBe(0);

    act(() => {
      result.current.set('a', 2);
    });
    expect((result.current as any).getVersion()).toBe(1);

    // 尝试切到 immutable（运行时应被忽略，仍走 mutable 路径）
    rerender({ mode: 'immutable' });

    expect(typeof (result.current as any).getVersion).toBe('function');
    expect((result.current as any).getVersion()).toBe(1);

    const ref1 = result.current;
    act(() => {
      result.current.set('a', 3);
    });
    const ref2 = result.current;

    expect(ref2).toBe(ref1);
    expect((result.current as any).getVersion()).toBe(2);
    expect(result.current.get('a')).toBe(3);
  });

  //  15）immutable：应具备 Map 原型链，并支持原生 entries/迭代器
  it('should link to Map.prototype and support native iteration in immutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, number>(
        [
          ['a', 1],
          ['b', 2],
        ],
        { mode: 'immutable' },
      ),
    );

    expect(Object.getPrototypeOf(result.current)).toBe(Map.prototype);
    expect(result.current).toBeInstanceOf(Map);

    const entries1 = Array.from(result.current.entries());
    expect(entries1).toEqual([
      ['a', 1],
      ['b', 2],
    ]);

    const entries2 = Array.from(result.current);
    expect(entries2).toEqual(entries1);
  });

  //  16）mutable：应具备 Map 原型链，并支持原生 entries/迭代器（更新后可读到最新）
  it('should link to Map.prototype and support native iteration in mutable mode', () => {
    const { result } = renderHook(() =>
      useMap<string, number>(
        [
          ['a', 1],
          ['b', 2],
        ],
        { mode: 'mutable' },
      ),
    );

    expect(Object.getPrototypeOf(result.current)).toBe(Map.prototype);
    expect(result.current).toBeInstanceOf(Map);

    act(() => {
      result.current.set('a', 10);
    });

    const entries = Array.from(result.current.entries());
    expect(entries).toEqual([
      ['a', 10],
      ['b', 2],
    ]);

    expect(Array.from(result.current)).toEqual(entries);
  });
});
