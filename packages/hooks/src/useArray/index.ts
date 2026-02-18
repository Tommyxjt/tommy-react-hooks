import { useRef } from 'react';
import useArrayImmutable, { type ImmutableReactiveArray } from './immutable';
import useArrayMutable, { type MutableReactiveArray } from './mutable';
import { normalizeInitToArray, type ArrayInit } from './utils';

export type UseArrayMode = 'immutable' | 'mutable';

export interface UseArrayOptions {
  mode?: UseArrayMode;
}

export type { ArrayInit } from './utils';
export type { ImmutableReactiveArray } from './immutable';
export type { MutableReactiveArray } from './mutable';

function useArray<T>(
  initial?: ArrayInit<T>,
  options?: { mode?: 'immutable' },
): ImmutableReactiveArray<T>;
function useArray<T>(
  initial: ArrayInit<T> | undefined,
  options: { mode: 'mutable' },
): MutableReactiveArray<T>;

function useArray<T>(initial?: ArrayInit<T>, options: UseArrayOptions = {}) {
  const modeRef = useRef<UseArrayMode>((options.mode ?? 'immutable') as UseArrayMode);

  // 只做一次：函数 initial 只调用一次；Iterable 只消费一次
  const initSnapshotRef = useRef<T[] | null>(null);
  if (initSnapshotRef.current === null) {
    initSnapshotRef.current = normalizeInitToArray<T>(initial);
  }

  // 为了通过 rules-of-hooks：无条件调用两套 hook，然后按首帧冻结 mode 返回其一
  const immutable = useArrayImmutable<T>(initSnapshotRef.current);
  const mutable = useArrayMutable<T>(initSnapshotRef.current);

  return (modeRef.current === 'mutable' ? mutable : immutable) as any;
}

export default useArray;
