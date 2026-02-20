import { useEffect, useRef } from 'react';
import type { EventBus, EventMap } from '../core/eventBusCore';

function isDev() {
  return typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';
}

/**
 * useEventBus（本版本）
 * - 只负责“获取一个已创建好的 bus 实例”
 * - 不创建 bus（创建交给 createEventBus）
 * - 不 clear bus（生命周期由「createEventBus层」决定）
 *
 * TODO:
 * 后续可扩展为 Context / Provider 形态（无参 useEventBus()）
 */
function useEventBus<E extends EventMap>(bus: EventBus<E> | null | undefined): EventBus<E> {
  if (!bus) {
    throw new Error(
      '[useEventBus] Missing bus instance. Please pass a bus created by createEventBus().',
    );
  }

  // 开发期提示：如果 bus 引用在同一组件生命周期内频繁变化，通常意味着在 render 里反复 createEventBus()
  const firstBusRef = useRef(bus);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!isDev()) return;
    if (warnedRef.current) return;

    if (firstBusRef.current !== bus) {
      warnedRef.current = true;
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(
          '[useEventBus] bus instance changed after mount. ' +
            'If this is unintentional, avoid calling createEventBus() during render.',
        );
      }
    }
  }, [bus]);

  return bus;
}

export default useEventBus;
