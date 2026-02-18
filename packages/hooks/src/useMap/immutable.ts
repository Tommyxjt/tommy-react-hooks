import { useMemo, useRef, useState } from 'react';
import useLatestRef from '../useLatestRef';
import { toMap, type ResolvedInit } from './utils';

export type ImmutableReactiveMap<K, V> = ReadonlyMap<K, V> & {
  set: (key: K, value: V) => ImmutableReactiveMap<K, V>;
  /**
   * 初始化或者更新：将 prev 的值传入 updater，根据 prev 是不是 undefined 返回初始值 / 更新值
   */
  compute: (key: K, updater: (prev: V | undefined) => V) => V;
  delete: (key: K) => boolean;
  clear: () => void;

  /**
   * 批量增量写入（patch/merge 语义）：不在 entries 里的 key 保留
   */
  batchSet: (entries: Iterable<readonly [K, V]>) => ImmutableReactiveMap<K, V>;

  /**
   * 整体替换（replace 语义）：next 里没有的 key 会被移除
   */
  replace: (next: Map<K, V> | Iterable<readonly [K, V]>) => ImmutableReactiveMap<K, V>;

  /**
   * 回到初始化快照
   */
  reset: () => ImmutableReactiveMap<K, V>;
};

export default function useMapImmutable<K, V>(
  initial?: ResolvedInit<K, V>,
): ImmutableReactiveMap<K, V> {
  // 固化初始快照（用于 reset）
  const initialSnapshotRef = useRef<Map<K, V> | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = toMap<K, V>(initial);
  }

  // immutable：每次真实变更都返回新的 Map 引用
  const [mapState, setMapState] = useState<Map<K, V>>(() => new Map(initialSnapshotRef.current!));

  // latestRef：每次 render 自动同步到最新 mapState
  // 写操作里会同步把 latestRef.current 指向 next，保证同一 tick 连续调用语义正确
  const latestRef = useLatestRef(mapState);

  // mapState 变 -> Proxy 引用也变，这样 deps/memo 比较才“像 immutable”
  const proxy = useMemo(() => {
    const cache = new Map<PropertyKey, any>();
    const dummyTarget = new Map<any, any>();

    const commit = (next: Map<K, V>) => {
      // 同步维护：保证同一 tick 后续操作基于最新结果
      latestRef.current = next;
      setMapState(next);
    };

    const handler: ProxyHandler<Map<any, any>> = {
      get(_target, prop, receiver) {
        // size 是 getter
        if (prop === 'size') return latestRef.current.size;

        // 同一次渲染内保证方法引用稳定
        if (cache.has(prop)) return cache.get(prop);

        // 写操作：把“原地改”转换为“创建新 Map + setState”
        if (prop === 'set') {
          const fn = (key: K, value: V) => {
            const cur = latestRef.current;

            const hasKey = cur.has(key);
            const oldValue = hasKey ? (cur.get(key) as V) : undefined;
            if (hasKey && Object.is(oldValue, value)) return receiver as ImmutableReactiveMap<K, V>;

            const next = new Map(cur);
            next.set(key, value);
            commit(next);

            return receiver as ImmutableReactiveMap<K, V>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'compute') {
          const fn = (key: K, updater: (prev: V | undefined) => V) => {
            const cur = latestRef.current;

            const hasKey = cur.has(key);
            const prev = hasKey ? (cur.get(key) as V) : undefined;

            const nextValue = updater(prev);

            // 仅当 key 已存在且值没变化时 no-op（保持引用不变）
            if (hasKey && Object.is(prev, nextValue)) return nextValue;

            const next = new Map(cur);
            next.set(key, nextValue);
            commit(next);

            return nextValue;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'delete') {
          const fn = (key: K) => {
            const cur = latestRef.current;
            if (!cur.has(key)) return false;

            const next = new Map(cur);
            next.delete(key);
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

            commit(new Map<K, V>());
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'batchSet') {
          const fn = (entries: Iterable<readonly [K, V]>) => {
            const cur = latestRef.current;
            let next: Map<K, V> | null = null;

            for (const [k, v] of entries) {
              const hasKey = cur.has(k);
              const oldValue = hasKey ? (cur.get(k) as V) : undefined;
              if (hasKey && Object.is(oldValue, v)) continue;

              if (next === null) next = new Map(cur);
              next.set(k, v);
            }

            if (next) commit(next);
            return receiver as ImmutableReactiveMap<K, V>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'replace') {
          const fn = (nextInput: Map<K, V> | Iterable<readonly [K, V]>) => {
            const cur = latestRef.current;

            // 小优化：传入当前同一个 Map 引用时直接 no-op
            if (nextInput instanceof Map && nextInput === cur) {
              return receiver as ImmutableReactiveMap<K, V>;
            }

            commit(toMap<K, V>(nextInput));
            return receiver as ImmutableReactiveMap<K, V>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'reset') {
          const fn = () => {
            commit(new Map(initialSnapshotRef.current!));
            return receiver as ImmutableReactiveMap<K, V>;
          };
          cache.set(prop, fn);
          return fn;
        }

        // 读方法：始终对 latestRef.current 生效（避免旧闭包读旧快照）
        const protoFn = (Map.prototype as any)[prop];
        if (typeof protoFn === 'function') {
          const fn = (...args: any[]) => protoFn.apply(latestRef.current, args);
          cache.set(prop, fn);
          return fn;
        }

        // 其它属性：直接从当前最新 map 上取（不缓存，避免动态值过期）
        return (latestRef.current as any)[prop];
      },
      getPrototypeOf() {
        return Map.prototype;
      },
    };

    return new Proxy(dummyTarget, handler) as unknown as ImmutableReactiveMap<K, V>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapState, latestRef]);

  return proxy;
}
