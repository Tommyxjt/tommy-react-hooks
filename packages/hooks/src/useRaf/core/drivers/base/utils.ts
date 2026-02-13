export function getGlobal<T = any>(key: string): T | undefined {
  const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
  return g ? (g as any)[key] : undefined;
}

export function defaultNow(): number {
  const performance = getGlobal<any>('performance');
  if (performance && typeof performance.now === 'function') return performance.now();
  return Date.now();
}
