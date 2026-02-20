// 这是纯 JS 的核心逻辑实现，不耦合 React，接入 React 机制在 hooks 中进行

export type EventMap = Record<PropertyKey, any>;

export type EventHandler<P> = (payload: P) => void;

export interface EventBus<E extends EventMap> {
  on: <K extends keyof E>(eventName: K, handler: EventHandler<E[K]>) => () => void;
  once: <K extends keyof E>(eventName: K, handler: EventHandler<E[K]>) => () => void;
  off: <K extends keyof E>(eventName: K, handler: EventHandler<E[K]>) => void;
  emit: <K extends keyof E>(eventName: K, payload: E[K]) => void;
  clear: <K extends keyof E>(eventName?: K) => void;
  listenerCount: <K extends keyof E>(eventName?: K) => number;
}

export interface EventBusCoreOptions<E extends EventMap> {
  /**
   * 单个 handler 抛错时的处理逻辑：
   * - 不会打断同一轮 emit 的其他 handler
   * - 未提供时默认走 console.error（若可用）
   */
  onError?: (
    error: unknown,
    meta: {
      eventName: keyof E;
      payload: E[keyof E];
      handler: (payload: any) => void;
    },
  ) => void;
}

function defaultOnError(error: unknown, meta: { eventName: PropertyKey }) {
  // 兼容 node / jsdom / 浏览器
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error('[EventBus]', meta.eventName, error);
  }
}

function eventBusCore<E extends EventMap>(options: EventBusCoreOptions<E> = {}): EventBus<E> {
  const onError = options.onError ?? defaultOnError;

  // listeners: Map<eventName, Set<handler>>
  const listeners = new Map<keyof E, Set<(payload: any) => void>>();

  // 检查某个 eventName 有没有对应的 Set 存在，决定是否需要初始化
  const ensureSet = (eventName: keyof E) => {
    let set = listeners.get(eventName);
    if (!set) {
      set = new Set();
      listeners.set(eventName, set);
    }
    return set;
  };

  const removeExactCallback = (eventName: keyof E, fn: Function) => {
    const set = listeners.get(eventName);
    if (!set) return;
    set.delete(fn as any);
    if (set.size === 0) listeners.delete(eventName);
  };

  // 为 once 提供 “off(eventName, originalHandler)” 能移除 wrapper 的能力：
  // Map<eventName, WeakMap<originalHandler, wrapperHandler>>
  // - 1. originalHandler 和 wrapperHandler 保持「一对一」的语义
  // - 2. 为什么外层还要按 eventName 分桶？
  //   - 同一个 cb 可能同时订阅多个事件，如果只有一个全局 WeakMap<cb, wrapper>，那就冲突了
  const onceWrapperMap = new Map<keyof E, WeakMap<Function, Function>>();

  const untrackOnceWrapper = (eventName: keyof E, original: Function, wrapper: Function) => {
    const wm = onceWrapperMap.get(eventName);
    if (!wm) return;

    // 同时移除 original 和 wrapper，
    // 但由于 WeakMap 没有 size，因此没法进行 onceWrapperMap 的空桶清理。
    // 但这边只留一个 eventName 的 key 可以接受，WeakMap 语义优于 Map。
    const current = wm.get(original);
    if (current === wrapper) {
      wm.delete(original);
    }
  };

  // once：重复注册直接忽略（no-op），不覆盖、不重排，与 on 的行为保持统一
  const once = <K extends keyof E>(eventName: K, handler: EventHandler<E[K]>) => {
    const set = ensureSet(eventName);

    // 确保该 eventName 下，同一个 handler 只有一个 once 订阅
    let wm = onceWrapperMap.get(eventName);
    if (!wm) {
      wm = new WeakMap();
      onceWrapperMap.set(eventName, wm);
    }

    const existingWrapper = wm.get(handler as any);
    if (existingWrapper) {
      // 重复注册：忽略。返回一个可用的 unsubscribe（行为与 on 重复注册更一致）
      return () => off(eventName, handler);
    }

    const wrapper = (payload: E[K]) => {
      // 先移除，避免 handler 内 re-emit 触发边界问题
      removeExactCallback(eventName, wrapper as any);
      untrackOnceWrapper(eventName, handler as any, wrapper as any);
      (handler as any)(payload);
    };

    set.add(wrapper as any);
    wm.set(handler as any, wrapper as any);

    return () => {
      removeExactCallback(eventName, wrapper as any);
      untrackOnceWrapper(eventName, handler as any, wrapper as any);
    };
  };

  const on = <K extends keyof E>(eventName: K, handler: EventHandler<E[K]>) => {
    const set = ensureSet(eventName);
    set.add(handler as any);
    return () => off(eventName, handler);
  };

  const off = <K extends keyof E>(eventName: K, handler: EventHandler<E[K]>) => {
    // 1) 尝试移除“原样 handler”（on 注册的就是它；或用户手动持有 once 的 wrapper）
    removeExactCallback(eventName, handler as any);

    // 2) 如果传入的是 once 的 original handler，则把该 original 对应的 wrapper 移除
    const wm = onceWrapperMap.get(eventName);
    const wrapper = wm?.get(handler as any);
    if (wrapper) {
      removeExactCallback(eventName, wrapper);
      wm!.delete(handler as any);
    }
  };

  const emit = <K extends keyof E>(eventName: K, payload: E[K]) => {
    const set = listeners.get(eventName);
    if (!set || set.size === 0) return;

    // 快照遍历：emit 过程中 on/off 不影响本轮 dispatch
    const snapshot = Array.from(set);

    for (const fn of snapshot) {
      try {
        fn(payload as any);
      } catch (error) {
        try {
          onError(error, { eventName, payload: payload as any, handler: fn });
        } catch {
          // onError 自己崩了也不要影响其他 handler
        }
      }
    }
  };

  // 移除某个 eventName 对应的所有的回调
  const clear = <K extends keyof E>(eventName?: K) => {
    if (eventName === undefined) {
      listeners.clear();
      onceWrapperMap.clear();
      return;
    }
    listeners.delete(eventName);
    onceWrapperMap.delete(eventName);
  };

  const listenerCount = <K extends keyof E>(eventName?: K) => {
    if (eventName !== undefined) return listeners.get(eventName)?.size ?? 0;
    let total = 0;
    for (const set of listeners.values()) total += set.size;
    return total;
  };

  return {
    on,
    once,
    off,
    emit,
    clear,
    listenerCount,
  };
}

export default eventBusCore;
