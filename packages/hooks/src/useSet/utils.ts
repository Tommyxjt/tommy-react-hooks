export type SetInit<T> = Set<T> | Iterable<T> | (() => Set<T> | Iterable<T>);

export type ResolvedInit<T> = Set<T> | Iterable<T> | undefined;

export function resolveInit<T>(initial?: SetInit<T>): ResolvedInit<T> {
  if (typeof initial === 'function') {
    return (initial as () => Set<T> | Iterable<T>)();
  }
  return initial;
}

export function toSet<T>(input?: ResolvedInit<T>): Set<T> {
  if (!input) return new Set<T>();
  return input instanceof Set ? new Set(input) : new Set(input);
}

/**
 * 只执行一次：函数 initial 只调用一次；Iterable 也只消费一次（转成 Set）
 */
export function normalizeInitToSet<T>(initial?: SetInit<T>): Set<T> {
  return toSet<T>(resolveInit<T>(initial));
}
