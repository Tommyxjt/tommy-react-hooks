import { useRef } from 'react';
import useSetImmutable, { type ImmutableReactiveSet } from './immutable';
import useSetMutable, { type MutableReactiveSet } from './mutable';
import { normalizeInitToSet, type SetInit } from './utils';

export type UseSetMode = 'immutable' | 'mutable';

export interface UseSetOptions {
  mode?: UseSetMode;
}

export type { SetInit } from './utils';
export type { ImmutableReactiveSet } from './immutable';
export type { MutableReactiveSet } from './mutable';

function useSet<T>(initial?: SetInit<T>, options?: { mode?: 'immutable' }): ImmutableReactiveSet<T>;
function useSet<T>(
  initial: SetInit<T> | undefined,
  options: { mode: 'mutable' },
): MutableReactiveSet<T>;

function useSet<T>(initial?: SetInit<T>, options: UseSetOptions = {}) {
  const modeRef = useRef<UseSetMode>((options.mode ?? 'immutable') as UseSetMode);

  // 只做一次：函数 initial 只调用一次；Iterable 只消费一次
  const initSnapshotRef = useRef<Set<T> | null>(null);
  if (initSnapshotRef.current === null) {
    initSnapshotRef.current = normalizeInitToSet<T>(initial);
  }

  // 为了通过 rules-of-hooks：无条件调用两套 hook，然后根据首帧冻结的 mode 返回其一
  const immutable = useSetImmutable<T>(initSnapshotRef.current);
  const mutable = useSetMutable<T>(initSnapshotRef.current);

  return (modeRef.current === 'mutable' ? mutable : immutable) as any;
}

export default useSet;
