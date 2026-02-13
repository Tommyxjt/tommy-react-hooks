import { useCallback, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '../../_internal/react/useLatestRef';
import { useStableCallback } from '../../_internal/react/useStableCallback';
import { useUnmount } from '../../_internal/react/useUnmount';
import type { FrameDriver, FrameRequestId } from '../core/drivers';
import { createFrameDriver } from '../core/drivers'; // 默认中间层 driver

/** 触发来源类型：下一帧正常触发 / 主动 flush */
export type UseRafSchedulerInvokeReason = 'frame' | 'flush';

export interface UseRafSchedulerInvokeMeta {
  /** 触发来源：下一帧正常触发 / 主动 flush */
  reason: UseRafSchedulerInvokeReason;
  /** 触发时刻（基于 now()） */
  at: number;
  /** requestAnimationFrame 提供的 timestamp（若可用） */
  frameTime?: number;

  /**
   * 本次 invoke 的耗时（ms）
   * - 在 tick 内测量
   * - 注意：该值在 invoke 返回后才会被写入（同步场景下在 invoke 内部读取可能还是初始值）
   */
  cost?: number;
}

export interface UseRafSchedulerOptions<T> {
  // 注入统一的 driver（driver.request / driver.cancel / driver.now）
  driver?: FrameDriver;

  /**
   * 同一帧内多次 schedule 的合并策略
   * - 默认：takeLatest（最后一次覆盖）
   * - useRafState 可用它实现 “函数式更新累计”
   */
  merge?: (prev: T, next: T) => T;

  /**
   * 是否需要发起/保留一次调度（例如 next 与 pending 等价时可跳过）
   * 默认：总是 true
   */
  shouldSchedule?: (pending: T | undefined, next: T) => boolean;

  /**
   * 执行前的二次检查（双层检查：调度前 shouldSchedule + 执行前 shouldInvoke）
   * - 返回 false：本次执行直接丢弃（清空 pending 与 payload，不会自动重试）
   */
  shouldInvoke?: (payload: T, meta: Omit<UseRafSchedulerInvokeMeta, 'cost'>) => boolean;

  /**
   * 批量更新入口（默认直接执行）
   * - React 18 大多数场景已自动批处理
   * - 需要强制批处理时（或兼容旧版本）由上层传入 unstable_batchedUpdates
   */
  batch?: (run: () => void) => void;

  /**
   * 时间监控开关（默认 false）
   * - 打开后会测量 invoke 耗时，并写入 meta.cost
   */
  monitor?: boolean;

  /**
   * 超过阈值则 warn（ms）
   * - 比如 16.6ms（一帧）或更保守 6~8ms
   */
  warnThresholdMs?: number;

  /**
   * 自定义 warn
   * - 默认 console.warn
   */
  onWarn?: (
    message: string,
    info: { cost: number; threshold: number; meta: UseRafSchedulerInvokeMeta },
  ) => void;

  /**
   * 错误隔离：单次 invoke 出错不会影响调度器自身状态机
   * - 默认 console.error
   */
  onError?: (error: unknown, payload: T, meta: UseRafSchedulerInvokeMeta) => void;

  /**
   * 帧率限制（单实例最小执行间隔）
   * - 例如 30fps / 60fps
   * - 实现方式：tick 到来时若未满足最小间隔，则 “保留 pending + payload” 并重挂下一帧
   */
  maxFps?: number;

  /**
   * cancel() 时是否先 flush 一次（一般不需要；默认 false）
   */
  flushOnCancel?: boolean;
}

export interface UseRafSchedulerActions<T> {
  /** 请求下一帧执行一次；同一帧内多次调用会合并 */
  schedule: (next: T) => void;

  /** 取消尚未执行的那一帧任务，并清空 pending */
  cancel: () => void;

  /**
   * 若存在 pending：立刻同步执行一次（reason='flush'）并清空 pending；
   * 若无 pending：no-op
   */
  flush: () => void;

  /** 释放资源（语义化的 cancel，供 unmount 调用） */
  dispose: () => void;

  /** 是否存在尚未执行的帧任务（适合 render 使用） */
  readonly pending: boolean;

  /** 获取「当前」是否存在尚未执行的帧任务（函数式调用不容易因错误使用产生闭包陷阱） */
  isPending: () => boolean;

  /** 读取当前 pending 的 payload（适合测试/调试/高级用法） */
  getLatestPayload: () => T | undefined;
}

/**
 * useRafScheduler
 *
 * 对齐帧边界：合并同一帧内同一回调的多次调度，只在下一帧执行一次 invoke（或主动 flush）。
 */
function useRafScheduler<T>(
  invoke: (payload: T, meta: UseRafSchedulerInvokeMeta) => void,
  options?: UseRafSchedulerOptions<T>,
): UseRafSchedulerActions<T> {
  const invokeStable = useStableCallback(invoke);

  // pending 使用 state + ref（避免 “pending 永远不更新” 的渲染问题）
  const [pendingState, setPendingState] = useState(false);
  const pendingRef = useLatestRef(pendingState);

  const latestPayloadRef = useRef<T | undefined>(undefined);

  // 记录 “已挂起的下一帧 tick” 的 requestId，便于 cancel / flush 时撤销，避免空跑
  const scheduledTickIdRef = useRef<FrameRequestId | null>(null);

  // 使用 useMemo 包裹，避免 createFrameDriver() 由于 rerender 不必要地生成多个实例
  const defaultFrameDriver = useMemo(() => createFrameDriver(), []);
  const driver = options?.driver ?? defaultFrameDriver;
  // driver 使用 useLatestRef 让内部回调永远读到最新的 driver
  // 防止 options.driver 变化时闭包拿旧值的问题
  const driverRef = useLatestRef(driver);

  // options 也用 ref：tick 内需要读取最新配置（maxFps / monitor / shouldInvoke 等）
  const optionsRef = useLatestRef(options);

  // 如果 schedule 时用的是某个 driver，那么 cancel / flush / tick 都应使用同一个 driver
  // 防止 options.driver 变化导致 cancel 用错 driver
  const scheduledDriverRef = useRef<FrameDriver | null>(null);

  const mergeStable = useStableCallback<NonNullable<UseRafSchedulerOptions<T>['merge']>>(
    options?.merge ?? ((_, next) => next),
  );

  const shouldScheduleStable = useStableCallback<
    NonNullable<UseRafSchedulerOptions<T>['shouldSchedule']>
  >(options?.shouldSchedule ?? (() => true));

  const shouldInvokeStable = useStableCallback<
    NonNullable<UseRafSchedulerOptions<T>['shouldInvoke']>
  >(options?.shouldInvoke ?? (() => true));

  const batchStable = useStableCallback<NonNullable<UseRafSchedulerOptions<T>['batch']>>(
    options?.batch ?? ((run) => run()),
  );

  const warnStable = useStableCallback<NonNullable<UseRafSchedulerOptions<T>['onWarn']>>(
    options?.onWarn ??
      ((message, info) => {
        // 监控/调试：默认只做 warn，不影响执行
        // eslint-disable-next-line no-console
        console.warn(message, info);
      }),
  );

  const onErrorStable = useStableCallback<NonNullable<UseRafSchedulerOptions<T>['onError']>>(
    options?.onError ??
      ((error) => {
        // 错误隔离：默认只上报，不影响其他逻辑
        // eslint-disable-next-line no-console
        console.error(error);
      }),
  );

  // 帧率限制：记录上一次“真正执行 invoke”的时刻（基于 driver.now）
  const lastInvokeAtRef = useRef<number | null>(null);

  const isPending = useCallback(() => pendingRef.current, [pendingRef]);

  const getLatestPayload = useCallback(() => latestPayloadRef.current, []);

  // 抽一个小工具：执行 invoke（含二次检查 / 批量更新 / 耗时监控 / 错误隔离）
  const runInvoke = useCallback(
    (payload: T, baseMeta: Omit<UseRafSchedulerInvokeMeta, 'cost'>, drv: FrameDriver) => {
      // 执行前二次检查：不通过则直接丢弃（不自动重试）
      if (!shouldInvokeStable(payload, baseMeta)) return;

      const meta: UseRafSchedulerInvokeMeta = { ...baseMeta, cost: undefined };

      const monitorEnabled = optionsRef.current?.monitor ?? false;
      const warnThresholdMs = optionsRef.current?.warnThresholdMs ?? 16.6;

      // 批量更新：由上层按需注入（例如 ReactDOM.unstable_batchedUpdates）
      batchStable(() => {
        const start = monitorEnabled ? drv.now() : 0;

        try {
          invokeStable(payload, meta);
        } catch (error) {
          // 错误隔离：单次 invoke 出错不影响 scheduler 状态机
          // - meta.cost 会在 finally 中被写入（若开启监控）
          onErrorStable(error, payload, meta);
        } finally {
          if (monitorEnabled) {
            const end = drv.now();
            const cost = end - start;
            meta.cost = cost;

            // 超阈值告警：默认 warn，可注入
            if (cost > warnThresholdMs) {
              warnStable('[useRafScheduler] invoke cost exceeded threshold', {
                cost,
                threshold: warnThresholdMs,
                meta,
              });
            }
          }
        }
      });
    },
    [batchStable, invokeStable, onErrorStable, optionsRef, shouldInvokeStable, warnStable],
  );

  /**
   * tick 逻辑抽出来：便于“跳帧限速”时重挂下一帧并复用同一套状态机。
   * - 这里的 driver 必须是“本轮 schedule 使用的 driver”
   * - frameTime 是 driver.request 提供的 timestamp（RAF/timeout fallback 各自对齐）
   */
  const runTick = useCallback(
    (drv: FrameDriver, frameTime: number) => {
      const payload = latestPayloadRef.current;

      // 可能在 tick 前被 cancel/flush 清空
      if (payload === undefined) {
        scheduledTickIdRef.current = null;
        scheduledDriverRef.current = null;

        latestPayloadRef.current = undefined;

        pendingRef.current = false;
        setPendingState(false);
        return;
      }

      const at = drv.now();

      // 帧率限制（单实例最小可行）：
      // - 若设置 maxFps，则确保两次真正执行 invoke 的间隔 >= minIntervalMs
      // - 不满足间隔：保留 pending + payload，并重挂下一帧（不清空）
      const maxFps = optionsRef.current?.maxFps;
      if (maxFps && maxFps > 0) {
        const minIntervalMs = 1000 / maxFps;
        const lastAt = lastInvokeAtRef.current;

        if (lastAt != null && at - lastAt < minIntervalMs) {
          // 本帧“主动跳帧”：只重挂下一帧，不执行 invoke
          // - 当前这一轮 tick 已经执行到这里了，因此需要用“同一个 driver”重新 request
          // - pending/payload 不清空，确保语义仍是“下一帧执行最新一次”
          scheduledTickIdRef.current = null;
          scheduledDriverRef.current = drv;

          const nextTickId = drv.request((nextFrameTime) => {
            runTick(drv, nextFrameTime);
          });

          // fallback='none' 等情况可能返回 0：此时无法再调度，直接清空避免 pending 卡死
          if (!nextTickId) {
            scheduledTickIdRef.current = null;
            scheduledDriverRef.current = null;

            latestPayloadRef.current = undefined;

            pendingRef.current = false;
            setPendingState(false);
            return;
          }

          scheduledTickIdRef.current = nextTickId;
          return;
        }
      }

      // tick 触发且满足执行条件：对 pending payload 做快照并清空（保证“本帧快照执行”）
      scheduledTickIdRef.current = null;
      scheduledDriverRef.current = null;

      latestPayloadRef.current = undefined;

      pendingRef.current = false;
      setPendingState(false);

      const isRafLike = drv.type?.includes('raf') ?? false;

      runInvoke(
        payload,
        {
          reason: 'frame',
          at,
          frameTime: isRafLike ? frameTime : undefined,
        },
        drv,
      );

      // 只有真正执行了 invoke 才更新 lastInvokeAt（帧率限制依赖它）
      lastInvokeAtRef.current = drv.now();
    },
    [optionsRef, pendingRef, runInvoke],
  );

  const flush = useCallback(() => {
    const drv = scheduledDriverRef.current ?? driverRef.current;
    if (!drv) return;

    if (!pendingRef.current) return;

    // flush 前先撤销已挂起的 tick：避免下一帧又触发一次“空 tick”
    const tickId = scheduledTickIdRef.current;
    if (tickId != null) {
      drv.cancel(tickId);
    }

    scheduledTickIdRef.current = null;
    scheduledDriverRef.current = null;

    const payload = latestPayloadRef.current;

    latestPayloadRef.current = undefined;

    pendingRef.current = false;
    setPendingState(false);

    if (payload === undefined) return;

    // flush 是同步触发，不属于 RAF timestamp
    runInvoke(
      payload,
      {
        reason: 'flush',
        at: drv.now(),
        frameTime: undefined,
      },
      drv,
    );

    // 只有真正执行了 invoke 才更新 lastInvokeAt（帧率限制依赖它）
    lastInvokeAtRef.current = drv.now();
  }, [driverRef, pendingRef, runInvoke]);

  const cancel = useCallback(() => {
    const drv = scheduledDriverRef.current ?? driverRef.current;
    if (!drv) return;

    // cancel() 时是否先 flush（保留原语义）
    if (optionsRef.current?.flushOnCancel) {
      // flush 内部会负责撤销已挂起 tick、清空 pending 与 payload
      // 这里直接调用 flush，避免重复写一套清理逻辑
      // 注意：flush 会读 pendingRef/current payloadRef，语义正确
      flush();
      return;
    }

    const tickId = scheduledTickIdRef.current;
    if (tickId != null) {
      drv.cancel(tickId);
    }

    scheduledTickIdRef.current = null;
    scheduledDriverRef.current = null;

    latestPayloadRef.current = undefined;

    // 同时更新 state（触发 rerender）+ ref（供 getter 即时读取）
    pendingRef.current = false;
    setPendingState(false);
  }, [driverRef, flush, optionsRef, pendingRef]);

  const schedule = useCallback(
    (next: T) => {
      const drv = driverRef.current;
      if (!drv) return;

      const pendingPayload = latestPayloadRef.current;

      // shouldSchedule 决定是否跳过 request，节省一次 tick（例如 next 与 pending 等价）
      if (!shouldScheduleStable(pendingPayload, next)) return;

      // 同一帧内多次 schedule：按 merge 合并（默认 takeLatest）
      const mergedPayload = pendingPayload === undefined ? next : mergeStable(pendingPayload, next);
      latestPayloadRef.current = mergedPayload;

      // 已经有“下一帧 tick”挂起：只更新 payload 即可
      if (pendingRef.current) return;

      // 启动新一帧调度
      pendingRef.current = true;
      setPendingState(true);

      scheduledDriverRef.current = drv;

      // 注意：driver.request 的 callback 参数含义对齐 RAF：
      // - RAF: frameTime 为 rAF timestamp
      // - Timeout fallback: frameTime 通常是 now() 的近似值（非严格 rAF timestamp）
      const tickId = drv.request((frameTime) => {
        runTick(drv, frameTime);
      });

      // fallback='none' 等情况可能返回 0：此时无法调度，直接清空避免 pending 卡死
      if (!tickId) {
        scheduledTickIdRef.current = null;
        scheduledDriverRef.current = null;

        latestPayloadRef.current = undefined;

        pendingRef.current = false;
        setPendingState(false);
        return;
      }

      scheduledTickIdRef.current = tickId;
    },
    [driverRef, mergeStable, pendingRef, runTick, shouldScheduleStable],
  );

  const dispose = cancel;

  // 1) scheduler 内部 useUnmount(dispose)
  useUnmount(dispose);

  const Actions = useMemo(
    () => ({
      schedule,
      cancel,
      flush,
      dispose,
      get pending() {
        return pendingRef.current;
      },
      isPending,
      getLatestPayload,
    }),
    [cancel, dispose, flush, getLatestPayload, isPending, schedule, pendingRef],
  );

  return Actions;
}

export default useRafScheduler;
