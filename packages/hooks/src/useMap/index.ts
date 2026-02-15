import { useRef } from 'react';
import useMapImmutable, { type ImmutableReactiveMap } from './immutable';
import useMapMutable, { type MutableReactiveMap } from './mutable';
import { normalizeInitToMap, type MapInit } from './utils';

export type UseMapMode = 'immutable' | 'mutable';

export interface UseMapOptions {
  mode?: UseMapMode;
}

export type { MapInit } from './utils';
export type { ImmutableReactiveMap } from './immutable';
export type { MutableReactiveMap } from './mutable';

/**
 * useMap
 * - 适用于 Map 的状态更新，用法基本等同原生 Map
 * - overload：根据 mode 推导返回类型
 * - 分为两种 mode 以适应不同场景：
 *   1. "immutable" mode：每次更新都会更新 map 引用，更符合 React 语义
 *   2. "mutable" mode：语义上更符合 React 逃生舱，在 map 数据量大时对性能更友好
 *    - 不更新 Map 引用，使用 useForceUpdate 强制触发 render
 *    - 提供一个 mapVersion 用于 useEffect 的 deps 或者 useMemo / React.memo 等判断 map 有没有更新
 */
function useMap<K, V>(
  initial?: MapInit<K, V>,
  options?: { mode?: 'immutable' },
): ImmutableReactiveMap<K, V>;
function useMap<K, V>(
  initial: MapInit<K, V> | undefined,
  options: { mode: 'mutable' },
): MutableReactiveMap<K, V>;

// 实现：mode 只在首帧读取一次，避免运行时切换导致 hook 路径变化
function useMap<K, V>(initial?: MapInit<K, V>, options: UseMapOptions = {}) {
  const modeRef = useRef<UseMapMode>((options.mode ?? 'immutable') as UseMapMode);

  // 只做一次：函数 initial 只调用一次；Iterable 只消费一次
  const initMapRef = useRef<Map<K, V> | null>(null);
  if (initMapRef.current === null) {
    initMapRef.current = normalizeInitToMap<K, V>(initial);
  }

  // 为了通过 rules-of-hooks：无条件调用两套 hook
  const immutable = useMapImmutable<K, V>(initMapRef.current);
  const mutable = useMapMutable<K, V>(initMapRef.current);

  return (modeRef.current === 'mutable' ? mutable : immutable) as any;
}

export default useMap;
