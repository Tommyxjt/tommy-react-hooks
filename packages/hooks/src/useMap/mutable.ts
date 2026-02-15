import { useRef } from 'react';
import useForceUpdate from '../useForceUpdate';
import { toMap, type ResolvedInit } from './utils';

export type MutableReactiveMap<K, V> = ReadonlyMap<K, V> & {
  set: (key: K, value: V) => MutableReactiveMap<K, V>;
  delete: (key: K) => boolean;
  clear: () => void;

  /**
   * 批量增量写入（patch/merge 语义）：不在 entries 里的 key 保留
   */
  batchSet: (entries: Iterable<readonly [K, V]>) => MutableReactiveMap<K, V>;

  /**
   * 整体替换（replace 语义）：next 里没有的 key 会被移除
   */
  replace: (next: Map<K, V> | Iterable<readonly [K, V]>) => MutableReactiveMap<K, V>;

  /**
   * 回到初始化快照
   */
  reset: () => MutableReactiveMap<K, V>;

  /**
   * 内容真实变化时递增；用于 deps/memo 语义（mutable 模式下引用通常不变）
   */
  getVersion: () => number;
};

export default function useMapMutable<K, V>(
  initial?: ResolvedInit<K, V>,
): MutableReactiveMap<K, V> {
  // 固化初始快照（用于 reset）
  const initialSnapshotRef = useRef<Map<K, V> | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = toMap<K, V>(initial);
  }

  const forceUpdate = useForceUpdate();

  // 真实数据放 ref：原地修改
  const mapRef = useRef<Map<K, V>>(new Map(initialSnapshotRef.current!));
  const versionRef = useRef(0);

  const bump = () => {
    versionRef.current += 1;
    forceUpdate();
  };

  const proxyRef = useRef<MutableReactiveMap<K, V> | null>(null);
  const methodCacheRef = useRef<Map<PropertyKey, any> | null>(null);
  if (methodCacheRef.current === null) {
    methodCacheRef.current = new Map<PropertyKey, any>();
  }

  const wrapMapProtoMethod = (prop: PropertyKey) => {
    const cache = methodCacheRef.current!;
    if (cache.has(prop)) return cache.get(prop);

    const protoFn = (Map.prototype as any)[prop];
    if (typeof protoFn !== 'function') return undefined;

    const fn = (...args: any[]) => protoFn.apply(mapRef.current, args);
    cache.set(prop, fn);
    return fn;
  };

  const getCustom = (prop: PropertyKey, receiver: any) => {
    const cache = methodCacheRef.current!;
    if (cache.has(prop)) return cache.get(prop);

    if (prop === 'getVersion') {
      const fn = () => versionRef.current;
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'set') {
      const fn = (key: K, value: V) => {
        const cur = mapRef.current;

        const hasKey = cur.has(key);
        const oldValue = hasKey ? (cur.get(key) as V) : undefined;
        if (hasKey && Object.is(oldValue, value)) return receiver as MutableReactiveMap<K, V>;

        cur.set(key, value);
        bump();
        return receiver as MutableReactiveMap<K, V>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'delete') {
      const fn = (key: K) => {
        const cur = mapRef.current;
        if (!cur.has(key)) return false;

        cur.delete(key);
        bump();
        return true;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'clear') {
      const fn = () => {
        const cur = mapRef.current;
        if (cur.size === 0) return;

        cur.clear();
        bump();
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'batchSet') {
      const fn = (entries: Iterable<readonly [K, V]>) => {
        const cur = mapRef.current;
        let changed = false;

        for (const [k, v] of entries) {
          const hasKey = cur.has(k);
          const oldValue = hasKey ? (cur.get(k) as V) : undefined;
          if (hasKey && Object.is(oldValue, v)) continue;

          cur.set(k, v);
          changed = true;
        }

        if (changed) bump();
        return receiver as MutableReactiveMap<K, V>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'replace') {
      const fn = (nextInput: Map<K, V> | Iterable<readonly [K, V]>) => {
        // 传入当前同一个 Map 引用时直接 no-op（避免无意义 bump）
        if (nextInput instanceof Map && nextInput === mapRef.current) {
          return receiver as MutableReactiveMap<K, V>;
        }

        mapRef.current = toMap<K, V>(nextInput);
        bump();
        return receiver as MutableReactiveMap<K, V>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'reset') {
      const fn = () => {
        mapRef.current = new Map(initialSnapshotRef.current!);
        bump();
        return receiver as MutableReactiveMap<K, V>;
      };
      cache.set(prop, fn);
      return fn;
    }

    return undefined;
  };

  if (proxyRef.current === null) {
    const dummyTarget = new Map<any, any>();

    const handler: ProxyHandler<Map<any, any>> = {
      get(_target, prop, receiver) {
        if (prop === 'size') return mapRef.current.size;

        const custom = getCustom(prop, receiver);
        if (custom) return custom;

        const wrapped = wrapMapProtoMethod(prop);
        if (wrapped) return wrapped;

        return Reflect.get(mapRef.current as any, prop);
      },
      getPrototypeOf() {
        return Map.prototype;
      },
    };

    proxyRef.current = new Proxy(dummyTarget, handler) as unknown as MutableReactiveMap<K, V>;
  }

  return proxyRef.current;
}
