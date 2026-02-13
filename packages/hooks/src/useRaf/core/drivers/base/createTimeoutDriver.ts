// createTimeoutDriver.ts
//
// timeout base driver（平台适配层、负责「行为对齐」）
//
// 设计目标：强对齐 RAF 的关键语义（在缺失 RAF 的环境下）
// - 同帧合并（coalescing）：同一个“帧窗口”内多次 request 只挂一个 tick
// - 同帧共享 timestamp：同一次 flush 内所有回调拿到同一个 frameTime
// - flush 期间新注册进入下一帧：flush 开始即“封口当前帧窗口”
// - FIFO：同帧回调按注册顺序执行
// - requestId/cancel 语义对齐：每次 request 返回独立 id，可取消；执行后自动失效
//
// 说明：
// - 跨实例合并通过 “模块级 Hub” 完成
// - Hub 按底座实现分域：setTimeout/clearTimeout/now/delay 相同 => 命中同一个 Hub

import { defaultNow, getGlobal } from './utils';
import { TimeoutHandle, FrameCallback, FrameDriver } from '../types';

export interface CreateTimeoutDriverOptions {
  /**
   * 指定 setTimeout / clearTimeout（便于测试环境注入）
   * 默认从 globalThis 取
   */
  setTimeout?: (cb: () => void, ms: number) => TimeoutHandle;
  clearTimeout?: (id: TimeoutHandle) => void;

  /**
   * now() 的实现
   * 默认：performance.now()（若存在）否则 Date.now()
   */
  now?: () => number;

  /**
   * 模拟帧的延迟（默认 16）
   * 注意：语义重点是“同帧合并”，不是 fps 保证
   */
  delay?: number;

  /**
   * 可选：调试标识
   * 默认 "timeout"
   */
  type?: string;
}

// —— Module-level: function identity -> stable id（用于 domainKey）——
let fnKey = 0; // 模块级计数器
const fnToFnKeyMap = new WeakMap<Function, number>();

function getStableFnKey(fn: Function): number {
  const hit = fnToFnKeyMap.get(fn);
  if (hit) return hit;
  fnKey += 1;
  fnToFnKeyMap.set(fn, fnKey); // 通过「模块级计数器」给这个函数引用分配一个 fnKey
  return fnKey;
}

// —— Module-level: wipFrameNode registry（按底座实现分域）——
interface TimeoutWipFrameNode {
  /** “同一帧窗口” 的核心状态：是否已经挂起一个 tick */
  hasPendingFrameTick: boolean;

  // setTimeout 的返回值，用于 cancel 挂起但是未被执行的 tick（同一帧窗口只允许一个）
  nextTickTimerId: TimeoutHandle | null;

  // 调试用：每开启一轮帧窗口 +1
  frameBatchCounter: number;

  // requestId 自增（对外暴露）
  nextRequestId: number;

  // 当前帧窗口的回调队列（FIFO + 支持 cancel），映射到每个 requestId
  callbackQueue: Map<number, FrameCallback>;

  // 底座能力
  delay: number;
  now: () => number;
  setTimeoutFn: (cb: () => void, ms: number) => TimeoutHandle;
  clearTimeoutFn: (id: TimeoutHandle) => void;
}

const domainKeyToWipFrameNodeMap = new Map<string, TimeoutWipFrameNode>();

function createWipFrameNode(args: {
  delay: number;
  now: () => number;
  setTimeoutFn: (cb: () => void, ms: number) => TimeoutHandle;
  clearTimeoutFn: (id: TimeoutHandle) => void;
}): TimeoutWipFrameNode {
  return {
    hasPendingFrameTick: false,
    nextTickTimerId: null,
    frameBatchCounter: 0,
    nextRequestId: 0,
    callbackQueue: new Map(),
    delay: args.delay,
    now: args.now,
    setTimeoutFn: args.setTimeoutFn,
    clearTimeoutFn: args.clearTimeoutFn,
  };
}

function getDomainKey(args: {
  delay: number;
  now: () => number;
  setTimeoutFn: (cb: () => void, ms: number) => TimeoutHandle;
  clearTimeoutFn: (id: TimeoutHandle) => void;
}): string {
  // 同底座实现（函数 identity 相同） + delay 相同 => 命中同一 Hub
  return [
    getStableFnKey(args.setTimeoutFn as unknown as Function),
    getStableFnKey(args.clearTimeoutFn as unknown as Function),
    getStableFnKey(args.now as unknown as Function),
    args.delay,
  ].join('|');
}

function getOrCreateWipFrameNode(args: {
  delay: number;
  now: () => number;
  setTimeoutFn: (cb: () => void, ms: number) => TimeoutHandle;
  clearTimeoutFn: (id: TimeoutHandle) => void;
}): TimeoutWipFrameNode {
  const domainKey = getDomainKey(args);
  const existing = domainKeyToWipFrameNodeMap.get(domainKey);
  if (existing) return existing;

  const wipFrameNode = createWipFrameNode(args);
  domainKeyToWipFrameNodeMap.set(domainKey, wipFrameNode);
  return wipFrameNode;
}

/**
 * createTimeoutDriver
 *
 * - 强对齐 RAF 的关键语义（在缺失 RAF 的环境下）
 * - 跨实例同帧合并：通过模块级 Hub（按底座实现分域）
 */
export function createTimeoutDriver(options: CreateTimeoutDriverOptions = {}): FrameDriver {
  const type = options.type ?? 'timeout';

  const delay = Math.max(0, options.delay ?? 16);

  const now = options.now ?? defaultNow;

  const gSetTimeout = getGlobal('setTimeout');
  const gClearTimeout = getGlobal('clearTimeout');

  // ⚠️ 必须绑定 this 至 globalThis，否则后续运行会抛错
  const defaultSetTimeout =
    typeof gSetTimeout === 'function'
      ? (gSetTimeout as unknown as (cb: () => void, ms: number) => TimeoutHandle).bind(globalThis)
      : undefined;

  // ⚠️ 必须绑定 this 至 globalThis，否则后续运行会抛错
  const defaultClearTimeout =
    typeof gClearTimeout === 'function'
      ? (gClearTimeout as unknown as (id: TimeoutHandle) => void).bind(globalThis)
      : undefined;

  const setTimeoutFn = options.setTimeout ?? defaultSetTimeout;
  const clearTimeoutFn = options.clearTimeout ?? defaultClearTimeout;

  // 极端环境：没有 setTimeout / clearTimeout 时，降级为 no-op driver
  // - request 返回 null（无效 id）
  // - cancel no-op
  if (typeof setTimeoutFn !== 'function' || typeof clearTimeoutFn !== 'function') {
    return {
      type: `${type}-none`,
      now,
      request: () => null,
      cancel: () => {},
    };
  }

  // wipFrameNode：正在累积本帧回调的那一个帧窗口节点
  const wipFrameNode = getOrCreateWipFrameNode({
    delay,
    now,
    setTimeoutFn,
    clearTimeoutFn,
  });

  const tick = () => {
    // 1) 封口当前帧窗口：flush 期间新增 request 必须进入下一帧
    wipFrameNode.hasPendingFrameTick = false;
    wipFrameNode.nextTickTimerId = null;

    // 2) 同帧共享 timestamp：只取一次
    const frameTime = wipFrameNode.now();

    // 3) 快照当前队列并清空（避免 flush 期间新增混入本帧）
    const callbacks = Array.from(wipFrameNode.callbackQueue.values()); // FIFO
    wipFrameNode.callbackQueue.clear();

    // 4) 批量执行：单个回调异常不应阻断其他回调（尽量贴近平台多回调语义）
    let firstError: unknown = null;
    for (const cb of callbacks) {
      try {
        cb(frameTime);
      } catch (err) {
        if (firstError === null) firstError = err;
      }
    }

    // 执行完所有回调后再抛出（若有）
    if (firstError !== null) {
      throw firstError;
    }
  };

  const request: FrameDriver['request'] = (cb) => {
    // 1) 分配 requestId（对外暴露）
    wipFrameNode.nextRequestId += 1;
    const requestId = wipFrameNode.nextRequestId;

    // 2) 入队（FIFO + 支持 cancel）
    wipFrameNode.callbackQueue.set(requestId, cb);

    // 3) 同帧合并：只在首次 request 时挂起一个 tick
    if (!wipFrameNode.hasPendingFrameTick) {
      wipFrameNode.hasPendingFrameTick = true;
      wipFrameNode.frameBatchCounter += 1;

      // 这边使用 wipFrameNode.setTimeoutFn 的方式调用；
      // 在 setTimeoutFn 没有 bind this 的情况下：
      // this 会绑定到 wipFrameNode（而不是 window / globalThis）。
      // 在某些运行环境（尤其是带 polyfill/zone 的环境、或某些浏览器实现）里，
      // setTimeout/clearTimeout 这类 host function 对 this 有要求，
      // 会抛 Illegal invocation 异常。
      wipFrameNode.nextTickTimerId = wipFrameNode.setTimeoutFn(tick, wipFrameNode.delay);
    }

    return requestId;
  };

  const cancel: FrameDriver['cancel'] = (id) => {
    // 0 为无效 id，直接忽略
    if (!id) return;

    wipFrameNode.callbackQueue.delete(id);

    // 若本帧窗口已挂起，但队列已空：取消 pending tick（避免空 flush）
    if (
      wipFrameNode.callbackQueue.size === 0 &&
      wipFrameNode.hasPendingFrameTick &&
      wipFrameNode.nextTickTimerId != null
    ) {
      // 与上面同理，需要提前绑定 this，不然会抛错
      wipFrameNode.clearTimeoutFn(wipFrameNode.nextTickTimerId);
      wipFrameNode.nextTickTimerId = null;
      wipFrameNode.hasPendingFrameTick = false;
    }
  };

  return {
    type,
    now: () => wipFrameNode.now(),
    request,
    cancel,
  };
}

export default createTimeoutDriver;
