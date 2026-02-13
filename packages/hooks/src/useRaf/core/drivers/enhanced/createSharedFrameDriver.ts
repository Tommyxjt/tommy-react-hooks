// ===== Shared Driver（先接入，后续增强） =====
//
// - createSharedFrameDriver 与 base driver（RAF/timeout）是同级的 driver 工厂（功能增强版）
// - 它不应该反向依赖 createFrameDriver（组装层），避免策略被隐藏 / 依赖方向倒置
// - 默认 baseDriver 的选择逻辑：优先 raf，其次 timeout，否则 none（这里直接依赖 base drivers）

import type { FrameDriver } from '../types';
import { createRafDriver } from '../base/createRafDriver';
import { createTimeoutDriver } from '../base/createTimeoutDriver';

let sharedDriver: FrameDriver | null = null;

/**
 * createSharedFrameDriver
 *
 * 返回 「模块单例」 的 shared driver。
 *
 * 这边会产生 “跨模块实例不共享” 的风险，暂时想到的解决方案如下：
 * - 将 shared hub 挂到 globalThis 的一个 symbol 上：
 *   - const KEY = Symbol.for('@tx-labs/frameDriver/shared')
 *   - globalThis[KEY] ??= createSharedHub(...)
 * 👆🏻 TODO：等到后续功能增强的时候再做
 *
 *
 * 设计意图（后续要实现的能力）：
 * - 内部只启动一个 RAF tick（同一帧内合并多个 request）
 * - 支持 budgetMs：每帧限定执行预算，超出则延后到下一帧
 *
 * time-slicing rAF hub 状态机：
 * - 任意时刻最多只有两种状态
 *   1. 当前正在执行的 tick（running）
 *   2. 下一帧「有且仅有一个」已挂起的 tick（scheduled = true，但还没执行）—— 避免嵌套地狱
 *
 * 当前实现（先接入）：
 * - 暂时直接 “重定向” 到 baseDriver（不合并、不分片）
 * - 把 “入口/依赖关系” 先固定住，后面只改这里的实现即可
 *
 * 注意：
 * - options 仅在第一次调用时生效（因为模块单例一旦创建就会复用）。
 */
export function createSharedFrameDriver(options?: {
  /**
   * shared driver 的底层 driver（默认：raf 优先，其次 timeout，否则 none）
   * 用于跨平台/测试注入
   */
  baseDriver?: FrameDriver;

  /**
   * 标识（调试用）
   */
  type?: string;

  /**
   * 未来扩展位：每帧预算（ms），超出则延后到下一帧执行
   * （可先不实现，只保留签名）
   */
  budgetMs?: number; // 默认 6ms
}): FrameDriver {
  if (sharedDriver) return sharedDriver;

  const base: FrameDriver = options?.baseDriver ??
    createRafDriver() ??
    createTimeoutDriver() ?? {
      type: 'none',
      now: () => Date.now(),
      request: () => 0,
      cancel: () => {},
    };

  const type = options?.type ?? 'shared-raf';

  // TODO: 实现 shared hub
  // - queue: Map<FrameRequestId, FrameCallback[]> 或 Set<FrameCallback>
  // - 同一帧内只 request 一次 base.request(tick)
  // - tick 内批量执行回调
  // - budgetMs: 超过预算则剩余任务留到下一帧继续跑

  sharedDriver = {
    type,
    now: () => base.now(),
    request: (cb) => base.request(cb),
    cancel: (id) => base.cancel(id),
  };

  return sharedDriver;
}
