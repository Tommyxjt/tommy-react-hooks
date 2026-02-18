export type ArrayInit<T> = T[] | Iterable<T> | (() => T[] | Iterable<T>);

export type ResolvedInit<T> = T[] | Iterable<T> | undefined;

export function resolveInit<T>(initial?: ArrayInit<T>): ResolvedInit<T> {
  if (typeof initial === 'function') {
    return (initial as () => T[] | Iterable<T>)();
  }
  return initial;
}

/**
 * 克隆/转换为数组
 * - 如果 input 是数组：用 slice() 复制（保留空槽）
 * - 如果 input 是 Iterable：用 Array.from()（不可能产生空槽）
 */
export function toArray<T>(input?: ResolvedInit<T>): T[] {
  if (!input) return [];
  return Array.isArray(input) ? input.slice() : Array.from(input);
}

/**
 * 只执行一次：函数 initial 只调用一次；Iterable 也只消费一次（转成数组）
 */
export function normalizeInitToArray<T>(initial?: ArrayInit<T>): T[] {
  return toArray<T>(resolveInit<T>(initial));
}

export function isArrayIndex(prop: PropertyKey): prop is `${number}` {
  if (typeof prop !== 'string') return false;
  // Array 索引规范: ToString(ToUint32(p)) === p && p !== "4294967295"
  const n = Number(prop);
  if (!Number.isInteger(n) || n < 0) return false;
  if (n >= 2 ** 32 - 1) return false;
  return String(n) === prop;
}

export function toLength(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function isSameArray<T>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const aHas = i in a;
    const bHas = i in b;
    if (aHas !== bHas) return false;
    if (aHas && !Object.is(a[i], b[i])) return false;
  }
  return true;
}
