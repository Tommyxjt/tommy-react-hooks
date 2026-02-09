import { useCallback, useMemo, useRef } from 'react';
import useBoolean from '../../useBoolean';
import useLatestRef from '../../useLatestRef';
import useUnmount from '../../useUnmount';
import useStableCallback from '../../useStableCallback';

interface DebounceControllerOptions {
  delay?: number; // 默认 500ms
  leading?: boolean; // 默认 false
  trailing?: boolean; // 默认 true
  skipInitial?: boolean; // 默认 false
  /**
   * 一轮连续调用中，最多等待多久就强制触发一次。
   */
  maxWait?: number;
}

interface DebounceControllerActions<P> {
  emit: (payload: P) => void; // “发射一次事件”，驱动 debounce 调度
  cancel: () => void;
  flush: () => void;
  pending: boolean;
  getLastPayload: () => P | undefined;
}

type DebounceControllerInvokeReason = 'leading' | 'trailing' | 'flush' | 'maxWait';

interface DebounceControllerInvokeMeta {
  reason: DebounceControllerInvokeReason;
  at: number;
}

function now() {
  // 兼容 node / jsdom 环境
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function useDebounceController<P>(
  invoke: (payload: P, meta: DebounceControllerInvokeMeta) => void,
  options: DebounceControllerOptions = {},
): DebounceControllerActions<P> {
  const {
    delay: delayOpt = 500,
    leading: leadingOpt = false,
    trailing: trailingOpt = true,
    skipInitial: skipInitialOpt = false,
    maxWait: maxWaitOpt,
  } = options;

  // 标准 useStableCallback 使用场景：返回一个引用永远稳定、但内部永远调用最新 invoke 的函数。
  const invokeStable = useStableCallback(invoke);

  // 使用 useLatest 包装：避免定时器回调拿到旧 options
  const optionsRef = useLatestRef({
    delay: Math.max(0, delayOpt),
    leading: leadingOpt,
    trailing: trailingOpt,
    skipInitial: skipInitialOpt,
    maxWait: maxWaitOpt === undefined ? undefined : Math.max(0, maxWaitOpt),
  });

  // 这边使用 state → ref，而不是直接使用 ref 是因为：
  // 如果只使用 ref，可能会出现整个防抖过程不触发任何 rerender 的情况
  //
  // 以 useDebouncedClick 为例：leading=true, trailing=false 时，
  // 防抖期结束通常只会走 cancel()，
  // 但 cancel() 不会触发任何 state 更新
  // ⇒ 组件不 rerender
  // ⇒ getter 里读到的 pending 永远停留在“上一次 render 的值”
  // 加入 state 后，防抖期结束会触发 rerender，pending 就会恢复
  const [pending, pendingActions] = useBoolean(false);
  const pendingRef = useLatestRef(pending);

  // 状态机 refs（不需要触发渲染）
  const lastPayloadRef = useRef<P | undefined>(undefined); // 用于保存最后一次的 payload

  // 是否有未被消费的 payload
  // 如果触发 trailing / flush / maxWait 时，
  // 没有未被消费的新 payload，
  // 则阻止该次 invoke 执行，避免无意义重复触发
  const hasUnconsumedPayloadRef = useRef(false);

  const didSkipInitialOnceRef = useRef(false);

  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cycleStartAtRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (trailingTimerRef.current) {
      clearTimeout(trailingTimerRef.current);
      trailingTimerRef.current = null;
    }
    if (maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
  }, []);

  // 结束当前防抖轮次，同时阻止还在 pending 的 invoke 回调
  const endCycle = useCallback(() => {
    clearTimers();
    pendingActions.setFalse();
    pendingRef.current = false;
    hasUnconsumedPayloadRef.current = false;
    cycleStartAtRef.current = null;
    // didSkipInitialOnceRef 不重置（skipInitial 只跳过整个生命周期第一次）
  }, [clearTimers, pendingActions, pendingRef]);

  const scheduleTrailingTimer = useCallback(() => {
    const { delay } = optionsRef.current;

    // 每次 emit 都应重置 trailing 计时器（标准 debounce 行为）
    if (trailingTimerRef.current) clearTimeout(trailingTimerRef.current);

    trailingTimerRef.current = setTimeout(() => {
      const { trailing } = optionsRef.current;

      // trailing 只有在 “有未处理的 payload（hasUnconsumedPayloadRef === true）” 时才会触发
      if (trailing && hasUnconsumedPayloadRef.current) {
        const payload = lastPayloadRef.current as P;
        invokeStable(payload, { reason: 'trailing', at: now() });
        hasUnconsumedPayloadRef.current = false;
      }

      // 无论是否 invoke，delay 到期都代表本轮防抖结束
      endCycle();
    }, delay);
  }, [endCycle, invokeStable, optionsRef, pendingRef]);

  const scheduleMaxWaitTimer = useCallback(() => {
    const { maxWait } = optionsRef.current;
    if (maxWait === undefined) return;

    // maxWait 是“一轮连续调用”维度：只在 cycle 启动时启动；
    // 如果它触发后仍处于 pending，可选择重新开始下一轮 maxWait（这里做了简单重启）。
    if (maxWaitTimerRef.current) return;

    maxWaitTimerRef.current = setTimeout(() => {
      maxWaitTimerRef.current = null;

      // 不在防抖期
      if (!pendingRef.current) return;

      const { trailing, maxWait: maxWaitMs } = optionsRef.current;

      // maxWait 本质上是“强制执行一次 trailing”
      // 因此也适用 trailing 的规则，即没有新 payload 则无需 invoke
      if (trailing && hasUnconsumedPayloadRef.current) {
        const payload = lastPayloadRef.current as P;
        invokeStable(payload, { reason: 'maxWait', at: now() });
        hasUnconsumedPayloadRef.current = false;

        // 这里不 endCycle：让连续输入场景下仍处于同一轮 pending，
        // maxWait 是单独的一条动线，不影响主动线的时序。
        // maxWait 执行完后，重启下一轮 maxWait（如果 maxWait 仍然存在且 > 0）
        cycleStartAtRef.current = now();
        if (maxWaitMs && maxWaitMs > 0) {
          // 继续保障下一段连续触发
          scheduleMaxWaitTimer();
        }
      }
    }, maxWait);
  }, [invokeStable, optionsRef]);

  /**
   * emit(payload: P): void
   * “发射一次事件”，驱动 debounce 调度。
   * 始终以 最后一次 payload 为准（trailing / flush 取 latest）。
   * @param payload
   */
  const emit = useCallback(
    (payload: P) => {
      const { skipInitial, leading } = optionsRef.current;

      // skipInitial 为 true 时：只跳过整个生命周期的第一次 emit（不 leading、不 trailing、不启动 pending）
      if (skipInitial && !didSkipInitialOnceRef.current) {
        didSkipInitialOnceRef.current = true;
        return;
      }

      lastPayloadRef.current = payload;
      hasUnconsumedPayloadRef.current = true;

      const startingNewCycle = !pendingRef.current;
      if (startingNewCycle) {
        pendingActions.setTrue();
        pendingRef.current = true;
        cycleStartAtRef.current = now();
      }

      // leading：仅在新的防抖轮次的第一次 emit 立即触发一次
      if (leading && startingNewCycle) {
        invokeStable(payload, { reason: 'leading', at: now() });
        // leading 已消费本次 payload，因此标记 hasUnconsumedPayloadRef 为 false，
        // 避免“点击一次执行两次的场景，即只有一次 emit 却同时执行了 leading 和 trailing”
        hasUnconsumedPayloadRef.current = false;
      }

      // 标准 debounce：每次 emit 都重置 trailing timer
      scheduleTrailingTimer();

      // maxWait：在新周期开始时启动（后续 emit 不重置）
      if (startingNewCycle) {
        scheduleMaxWaitTimer();
      }
    },
    [
      pendingActions,
      pendingRef,
      scheduleMaxWaitTimer,
      scheduleTrailingTimer,
      invokeStable,
      optionsRef,
    ],
  );

  /**
   * 清除定时器，进入空闲状态
   */
  const cancel = useCallback(() => {
    endCycle();
  }, [endCycle]);

  /**
   * 立刻执行 “本来会在 trailing 执行的那一次”（如果存在）
   * 如果当前并没有“待执行的一次”，那么 flush 不应该再执行一次，否则就会重复副作用。
   */
  const flush = useCallback(() => {
    if (!pendingRef.current) return;

    const { trailing } = optionsRef.current;

    if (trailing && hasUnconsumedPayloadRef.current) {
      const payload = lastPayloadRef.current as P;
      invokeStable(payload, { reason: 'flush', at: now() });
      hasUnconsumedPayloadRef.current = false;
    }

    endCycle();
  }, [endCycle, invokeStable, optionsRef, pendingRef]);

  /**
   * 获取最新的 payload
   * @returns
   */
  const getLastPayload = useCallback(() => lastPayloadRef.current, []);

  useUnmount(cancel);

  // pending 用 getter 动态读取 ref（防止闭包）
  return useMemo(
    () => ({
      emit,
      cancel,
      flush,
      getLastPayload,
      pending,
    }),
    [cancel, emit, flush, getLastPayload, pending],
  );
}

export default useDebounceController;
