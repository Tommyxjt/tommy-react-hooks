import eventBusCore, {
  type EventBus,
  type EventBusCoreOptions,
  type EventMap,
} from '../core/eventBusCore';

export interface CreateEventBusOptions<E extends EventMap> extends EventBusCoreOptions<E> {
  /**
   * 调试名：用于日志定位（可选）
   */
  debugName?: string;
  /**
   * 开发期监听器数量告警阈值
   * - 默认 50
   * - <= 0 表示关闭告警
   */
  maxListeners?: number;
}

function isDev() {
  return typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';
}

function defaultFactoryOnError(
  error: unknown,
  meta: {
    eventName: PropertyKey;
    payload: unknown;
    handler: (payload: any) => void;
  },
  debugName?: string,
) {
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    const scope = debugName ? `[EventBus:${debugName}]` : '[EventBus]';
    console.error(scope, meta.eventName, error);
  }
}

function normalizeMaxListeners(input?: number) {
  if (input === undefined) return 50;
  if (!Number.isFinite(input)) return 50;
  if (input <= 0) return 0;
  return Math.floor(input);
}

function createEventBus<E extends EventMap>(options: CreateEventBusOptions<E> = {}): EventBus<E> {
  const { debugName, onError: onErrorOpt } = options;
  const maxListeners = normalizeMaxListeners(options.maxListeners);

  const onError: EventBusCoreOptions<E>['onError'] =
    onErrorOpt ||
    ((error, meta) =>
      defaultFactoryOnError(
        error,
        {
          eventName: meta.eventName as PropertyKey,
          payload: meta.payload,
          handler: meta.handler,
        },
        debugName,
      ));

  const core = eventBusCore<E>({ onError });

  // 开发期：同一 eventName 只告警一次，避免刷屏
  const warnedEventNames = new Set<PropertyKey>();

  const maybeWarnMaxListeners = <K extends keyof E>(eventName: K) => {
    if (!isDev()) return;
    if (maxListeners <= 0) return;

    const count = core.listenerCount(eventName);
    if (count <= maxListeners) return;
    if (warnedEventNames.has(eventName as PropertyKey)) return;

    warnedEventNames.add(eventName as PropertyKey);

    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      const scope = debugName ? `[EventBus:${debugName}]` : '[EventBus]';
      console.warn(
        `${scope} listener count exceeded maxListeners for event "${String(
          eventName,
        )}": ${count} > ${maxListeners}`,
      );
    }
  };

  const on: EventBus<E>['on'] = (eventName, handler) => {
    const unsubscribe = core.on(eventName as any, handler as any);
    maybeWarnMaxListeners(eventName as any);
    return unsubscribe as any;
  };

  const once: EventBus<E>['once'] = (eventName, handler) => {
    const unsubscribe = core.once(eventName as any, handler as any);
    maybeWarnMaxListeners(eventName as any);
    return unsubscribe as any;
  };

  const off: EventBus<E>['off'] = (eventName, handler) => {
    core.off(eventName as any, handler as any);
  };

  const emit: EventBus<E>['emit'] = (eventName, payload) => {
    core.emit(eventName as any, payload as any);
  };

  const clear: EventBus<E>['clear'] = (eventName?) => {
    core.clear(eventName as any);
    // 被 clear 掉的 eventName 对应告警标记也顺手清掉，避免后续永不再告警
    if (eventName === undefined) {
      warnedEventNames.clear();
      return;
    }
    warnedEventNames.delete(eventName as PropertyKey);
  };

  const listenerCount: EventBus<E>['listenerCount'] = (eventName?) => {
    return core.listenerCount(eventName as any) as any;
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

export default createEventBus;
