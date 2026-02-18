import { useRef } from 'react';
import { useForceUpdate } from '../_internal/react/useForceUpdate';
import { toSet, type ResolvedInit } from './utils';

export type MutableReactiveSet<T> = ReadonlySet<T> & {
  add: (value: T) => MutableReactiveSet<T>;
  delete: (value: T) => boolean;
  clear: () => void;

  addAll: (values: Iterable<T>) => MutableReactiveSet<T>;
  deleteAll: (values: Iterable<T>) => MutableReactiveSet<T>;
  retainAll: (values: Iterable<T>) => MutableReactiveSet<T>;

  replace: (next: Set<T> | Iterable<T>) => MutableReactiveSet<T>;
  reset: () => MutableReactiveSet<T>;

  tryAdd: (value: T) => boolean;
  tryDelete: (value: T) => boolean;

  toArray: () => T[];
  toSet: () => Set<T>;

  hasAny: (values: Iterable<T>) => boolean;
  hasAll: (values: Iterable<T>) => boolean;

  union: (other: Set<T> | Iterable<T>) => Set<T>;
  intersection: (other: Set<T> | Iterable<T>) => Set<T>;
  difference: (other: Set<T> | Iterable<T>) => Set<T>;
  symmetricDifference: (other: Set<T> | Iterable<T>) => Set<T>;

  /**
   * 内容真实变化时递增；用于 deps/memo 语义（mutable 模式下引用通常不变）
   */
  getVersion: () => number;
};

export default function useSetMutable<T>(initialSnapshot?: ResolvedInit<T>): MutableReactiveSet<T> {
  // 固化初始快照（用于 reset）
  const initialSnapshotRef = useRef<Set<T> | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = toSet<T>(initialSnapshot);
  }

  const forceUpdate = useForceUpdate();

  // 真实数据放 ref：原地修改
  const setRef = useRef<Set<T>>(new Set(initialSnapshotRef.current!));
  const versionRef = useRef(0);

  const bump = () => {
    versionRef.current += 1;
    forceUpdate();
  };

  const proxyRef = useRef<MutableReactiveSet<T> | null>(null);
  const cacheRef = useRef<Map<PropertyKey, any> | null>(null);
  if (cacheRef.current === null) cacheRef.current = new Map<PropertyKey, any>();

  const toOtherSet = (other: Set<T> | Iterable<T>) =>
    other instanceof Set ? other : new Set(other);

  const wrapProtoMethod = (prop: PropertyKey) => {
    const cache = cacheRef.current!;
    if (cache.has(prop)) return cache.get(prop);

    const protoFn = (Set.prototype as any)[prop];
    if (typeof protoFn !== 'function') return undefined;

    const fn = (...args: any[]) => protoFn.apply(setRef.current, args);
    cache.set(prop, fn);
    return fn;
  };

  const getCustom = (prop: PropertyKey, receiver: any) => {
    const cache = cacheRef.current!;
    if (cache.has(prop)) return cache.get(prop);

    if (prop === 'getVersion') {
      const fn = () => versionRef.current;
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'add') {
      const fn = (value: T) => {
        const cur = setRef.current;
        if (cur.has(value)) return receiver as MutableReactiveSet<T>;

        cur.add(value);
        bump();
        return receiver as MutableReactiveSet<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'tryAdd') {
      const fn = (value: T) => {
        const cur = setRef.current;
        if (cur.has(value)) return false;

        cur.add(value);
        bump();
        return true;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'delete') {
      const fn = (value: T) => {
        const cur = setRef.current;
        if (!cur.has(value)) return false;

        cur.delete(value);
        bump();
        return true;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'tryDelete') {
      const fn = (value: T) => {
        const cur = setRef.current;
        if (!cur.has(value)) return false;

        cur.delete(value);
        bump();
        return true;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'clear') {
      const fn = () => {
        const cur = setRef.current;
        if (cur.size === 0) return;

        cur.clear();
        bump();
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'addAll') {
      const fn = (values: Iterable<T>) => {
        const cur = setRef.current;
        let changed = false;

        for (const v of values) {
          if (cur.has(v)) continue;
          cur.add(v);
          changed = true;
        }

        if (changed) bump();
        return receiver as MutableReactiveSet<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'deleteAll') {
      const fn = (values: Iterable<T>) => {
        const cur = setRef.current;
        let changed = false;

        for (const v of values) {
          if (!cur.has(v)) continue;
          cur.delete(v);
          changed = true;
        }

        if (changed) bump();
        return receiver as MutableReactiveSet<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'retainAll') {
      const fn = (values: Iterable<T>) => {
        const cur = setRef.current;
        if (cur.size === 0) return receiver as MutableReactiveSet<T>;

        const keep = new Set(values);
        let changed = false;

        for (const v of cur) {
          if (!keep.has(v)) {
            cur.delete(v);
            changed = true;
          }
        }

        if (changed) bump();
        return receiver as MutableReactiveSet<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'replace') {
      const fn = (nextInput: Set<T> | Iterable<T>) => {
        if (nextInput instanceof Set && nextInput === setRef.current) {
          return receiver as MutableReactiveSet<T>;
        }

        setRef.current = toSet<T>(nextInput);
        bump();
        return receiver as MutableReactiveSet<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'reset') {
      const fn = () => {
        setRef.current = new Set(initialSnapshotRef.current!);
        bump();
        return receiver as MutableReactiveSet<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'toArray') {
      const fn = () => Array.from(setRef.current);
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'toSet') {
      const fn = () => new Set(setRef.current);
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'hasAny') {
      const fn = (values: Iterable<T>) => {
        const cur = setRef.current;
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
        const cur = setRef.current;
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
        const out = new Set(setRef.current);
        for (const v of other) out.add(v);
        return out;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'intersection') {
      const fn = (other: Set<T> | Iterable<T>) => {
        const otherSet = toOtherSet(other);
        const out = new Set<T>();
        for (const v of setRef.current) {
          if (otherSet.has(v)) out.add(v);
        }
        return out;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'difference') {
      const fn = (other: Set<T> | Iterable<T>) => {
        const otherSet = toOtherSet(other);
        const out = new Set<T>();
        for (const v of setRef.current) {
          if (!otherSet.has(v)) out.add(v);
        }
        return out;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'symmetricDifference') {
      const fn = (other: Set<T> | Iterable<T>) => {
        const otherSet = toOtherSet(other);
        const out = new Set(setRef.current);
        for (const v of otherSet) {
          if (out.has(v)) out.delete(v);
          else out.add(v);
        }
        return out;
      };
      cache.set(prop, fn);
      return fn;
    }

    return undefined;
  };

  if (proxyRef.current === null) {
    const dummyTarget = new Set<any>();

    const handler: ProxyHandler<Set<any>> = {
      get(_target, prop, receiver) {
        if (prop === 'size') return setRef.current.size;

        const custom = getCustom(prop, receiver);
        if (custom) return custom;

        const wrapped = wrapProtoMethod(prop);
        if (wrapped) return wrapped;

        return Reflect.get(setRef.current as any, prop);
      },
      getPrototypeOf() {
        return Set.prototype;
      },
    };

    proxyRef.current = new Proxy(dummyTarget, handler) as unknown as MutableReactiveSet<T>;
  }

  return proxyRef.current;
}
