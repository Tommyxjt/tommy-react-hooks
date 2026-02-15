export type MapInit<K, V> =
  | Map<K, V>
  | Iterable<readonly [K, V]>
  | (() => Map<K, V> | Iterable<readonly [K, V]>);

export type ResolvedInit<K, V> = Map<K, V> | Iterable<readonly [K, V]> | undefined;

export function resolveInit<K, V>(
  initial?: MapInit<K, V>,
): Map<K, V> | Iterable<readonly [K, V]> | undefined {
  if (typeof initial === 'function') {
    return (initial as () => Map<K, V> | Iterable<readonly [K, V]>)();
  }
  return initial;
}

export function toMap<K, V>(input?: Map<K, V> | Iterable<readonly [K, V]>): Map<K, V> {
  if (!input) return new Map<K, V>();
  return input instanceof Map ? new Map(input) : new Map(input);
}

/**
 * 只执行一次：函数 initial 只调用一次；Iterable 也只消费一次（转成 Map）
 */
export function normalizeInitToMap<K, V>(initial?: MapInit<K, V>): Map<K, V> {
  return toMap<K, V>(resolveInit<K, V>(initial));
}
