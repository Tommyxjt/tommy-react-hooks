import { useMemo, useRef, useState } from 'react';
import { useLatestRef } from '../_internal/react/useLatestRef';
import { toSet, type ResolvedInit } from './utils';

export type ImmutableReactiveSet<T> = ReadonlySet<T> & {
  add: (value: T) => ImmutableReactiveSet<T>;
  delete: (value: T) => boolean;
  clear: () => void;

  /**
   * 批量添加（增量语义）：只新增，不影响未出现的元素
   */
  addAll: (values: Iterable<T>) => ImmutableReactiveSet<T>;

  /**
   * 批量删除：删除 values 中出现的元素
   */
  deleteAll: (values: Iterable<T>) => ImmutableReactiveSet<T>;

  /**
   * 仅保留 values 中存在的元素（交集过滤）
   */
  retainAll: (values: Iterable<T>) => ImmutableReactiveSet<T>;

  /**
   * 整体替换（replace 语义）
   */
  replace: (next: Set<T> | Iterable<T>) => ImmutableReactiveSet<T>;

  /**
   * 回到初始化快照
   */
  reset: () => ImmutableReactiveSet<T>;

  /**
   * 若不存在则添加并返回 true，否则返回 false（不触发更新）
   */
  tryAdd: (value: T) => boolean;

  /**
   * 若存在则删除并返回 true，否则返回 false（不触发更新）
   */
  tryDelete: (value: T) => boolean;

  /**
   * 快照工具：返回数组/Set（plain）
   */
  toArray: () => T[];
  toSet: () => Set<T>;

  /**
   * 包含判断：any/all
   */
  hasAny: (values: Iterable<T>) => boolean;
  hasAll: (values: Iterable<T>) => boolean;

  /**
   * 集合运算：返回 plain Set（不修改自身）
   */
  union: (other: Set<T> | Iterable<T>) => Set<T>;
  intersection: (other: Set<T> | Iterable<T>) => Set<T>;
  difference: (other: Set<T> | Iterable<T>) => Set<T>;
  symmetricDifference: (other: Set<T> | Iterable<T>) => Set<T>;
};

export default function useSetImmutable<T>(
  initialSnapshot?: ResolvedInit<T>,
): ImmutableReactiveSet<T> {
  // 固化初始快照（用于 reset）
  const initialSnapshotRef = useRef<Set<T> | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = toSet<T>(initialSnapshot);
  }

  // immutable：每次真实变更都返回新的 Set 引用
  const [setState, setSetState] = useState<Set<T>>(() => new Set(initialSnapshotRef.current!));

  // latestRef：每次 render 自动同步到最新 setState；写操作里会同步维护 latestRef.current
  const latestRef = useLatestRef(setState);

  // 依赖 setState 是刻意设计：immutable 需要在内容变化时返回新引用（便于 deps/memo 比较）
  const proxy = useMemo(() => {
    const cache = new Map<PropertyKey, any>();
    const dummyTarget = new Set<any>();

    const commit = (next: Set<T>) => {
      // 同步维护：保证同一 tick 后续操作基于最新结果
      latestRef.current = next;
      setSetState(next);
    };

    const toOtherSet = (other: Set<T> | Iterable<T>) =>
      other instanceof Set ? other : new Set(other);

    const handler: ProxyHandler<Set<any>> = {
      get(_target, prop, receiver) {
        if (prop === 'size') return latestRef.current.size;
        if (cache.has(prop)) return cache.get(prop);

        if (prop === 'add') {
          const fn = (value: T) => {
            const cur = latestRef.current;
            if (cur.has(value)) return receiver as ImmutableReactiveSet<T>;

            const next = new Set(cur);
            next.add(value);
            commit(next);
            return receiver as ImmutableReactiveSet<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'tryAdd') {
          const fn = (value: T) => {
            const cur = latestRef.current;
            if (cur.has(value)) return false;

            const next = new Set(cur);
            next.add(value);
            commit(next);
            return true;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'delete') {
          const fn = (value: T) => {
            const cur = latestRef.current;
            if (!cur.has(value)) return false;

            const next = new Set(cur);
            next.delete(value);
            commit(next);
            return true;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'tryDelete') {
          const fn = (value: T) => {
            const cur = latestRef.current;
            if (!cur.has(value)) return false;

            const next = new Set(cur);
            next.delete(value);
            commit(next);
            return true;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'clear') {
          const fn = () => {
            const cur = latestRef.current;
            if (cur.size === 0) return;
            commit(new Set<T>());
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'addAll') {
          const fn = (values: Iterable<T>) => {
            const cur = latestRef.current;
            let next: Set<T> | null = null;

            for (const v of values) {
              if (cur.has(v)) continue;
              if (next === null) next = new Set(cur);
              next.add(v);
            }

            if (next) commit(next);
            return receiver as ImmutableReactiveSet<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'deleteAll') {
          const fn = (values: Iterable<T>) => {
            const cur = latestRef.current;
            let next: Set<T> | null = null;

            for (const v of values) {
              if (!cur.has(v)) continue;
              if (next === null) next = new Set(cur);
              next.delete(v);
            }

            if (next) commit(next);
            return receiver as ImmutableReactiveSet<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'retainAll') {
          const fn = (values: Iterable<T>) => {
            const cur = latestRef.current;
            if (cur.size === 0) return receiver as ImmutableReactiveSet<T>;

            const keep = new Set(values);
            let changed = false;
            const next = new Set<T>();

            for (const v of cur) {
              if (keep.has(v)) {
                next.add(v);
              } else {
                changed = true;
              }
            }

            if (changed) commit(next);
            return receiver as ImmutableReactiveSet<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'replace') {
          const fn = (nextInput: Set<T> | Iterable<T>) => {
            const cur = latestRef.current;
            if (nextInput instanceof Set && nextInput === cur)
              return receiver as ImmutableReactiveSet<T>;

            commit(toSet<T>(nextInput));
            return receiver as ImmutableReactiveSet<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'reset') {
          const fn = () => {
            commit(new Set(initialSnapshotRef.current!));
            return receiver as ImmutableReactiveSet<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'toArray') {
          const fn = () => Array.from(latestRef.current);
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'toSet') {
          const fn = () => new Set(latestRef.current);
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'hasAny') {
          const fn = (values: Iterable<T>) => {
            const cur = latestRef.current;
            for (const v of values) {
              if (cur.has(v)) return true;
            }
            return false;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'hasAll') {
          const fn = (values: Iterable<T>) => {
            const cur = latestRef.current;
            for (const v of values) {
              if (!cur.has(v)) return false;
            }
            return true;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'union') {
          const fn = (other: Set<T> | Iterable<T>) => {
            const cur = latestRef.current;
            const out = new Set(cur);
            for (const v of other) out.add(v);
            return out;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'intersection') {
          const fn = (other: Set<T> | Iterable<T>) => {
            const cur = latestRef.current;
            const otherSet = toOtherSet(other);
            const out = new Set<T>();
            for (const v of cur) {
              if (otherSet.has(v)) out.add(v);
            }
            return out;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'difference') {
          const fn = (other: Set<T> | Iterable<T>) => {
            const cur = latestRef.current;
            const otherSet = toOtherSet(other);
            const out = new Set<T>();
            for (const v of cur) {
              if (!otherSet.has(v)) out.add(v);
            }
            return out;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'symmetricDifference') {
          const fn = (other: Set<T> | Iterable<T>) => {
            const cur = latestRef.current;
            const otherSet = toOtherSet(other);
            const out = new Set(cur);
            for (const v of otherSet) {
              if (out.has(v)) out.delete(v);
              else out.add(v);
            }
            return out;
          };
          cache.set(prop, fn);
          return fn;
        }

        // 读方法：始终对 latestRef.current 生效（避免旧闭包读旧快照）
        const protoFn = (Set.prototype as any)[prop];
        if (typeof protoFn === 'function') {
          const fn = (...args: any[]) => protoFn.apply(latestRef.current, args);
          cache.set(prop, fn);
          return fn;
        }

        return (latestRef.current as any)[prop];
      },
      getPrototypeOf() {
        return Set.prototype;
      },
    };

    return new Proxy(dummyTarget, handler) as unknown as ImmutableReactiveSet<T>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setState]);

  return proxy;
}
