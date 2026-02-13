// createFrameDriver.ts
//
// useRafScheduler 实现的中间层
//
// - 目录结构设计：
//   - core/drivers/base：createRafDriver / createTimeoutDriver（负责环境探测 + 默认实现选择）
//     - 负责「行为对齐」
//     - Timeout fallback 尽量对齐原生 RAF 的行为：同帧回调批量触发 + 同一帧共享同一个 timestamp
//
//   - core/drivers/enhanced：createSharedFrameDriver（增强版 driver，与 base 同级）
//     - 负责「功能增强」：“批量 flush”、“budget / time-slicing”
//
//   - core/drivers/createFrameDriver：组装/选择层（不做环境探测）
//     - 负责对接 driver
//     - 约束 driver 实现接口：FrameDriver（request / cancel / now / type）

import type { FrameDriver } from './types';
import type { CreateRafDriverOptions } from './base/createRafDriver';
import type { CreateTimeoutDriverOptions } from './base/createTimeoutDriver';
import { createRafDriver } from './base/createRafDriver';
import { createTimeoutDriver } from './base/createTimeoutDriver';
import { createSharedFrameDriver } from './enhanced/createSharedFrameDriver';

export interface CreateFrameDriverOptions {
  /**
   * 指定 RAF / CAF 的实现（便于测试或跨平台注入）
   * 默认实现选择下沉到 rafDriver 内部
   */
  requestAnimationFrame?: CreateRafDriverOptions['requestAnimationFrame'];
  cancelAnimationFrame?: CreateRafDriverOptions['cancelAnimationFrame'];

  /**
   * now() 的实现
   * 默认实现选择下沉到 base drivers 内部
   */
  now?: CreateRafDriverOptions['now'];

  /**
   * 没有 RAF 时的降级策略
   * - 'timeout'：使用 setTimeout 模拟一帧（默认）
   * - 'none'：没有 RAF 时 request 直接 no-op（⚠️ 不建议）
   */
  fallback?: 'timeout' | 'none';

  /**
   * fallback 为 timeout 时的延迟（默认 16）
   * 说明：timeout 只是“近似对齐帧”，并不保证 60fps。
   */
  fallbackDelay?: number;

  /**
   * 指定 setTimeout / clearTimeout（便于测试环境注入）
   * 默认实现选择下沉到 timeoutDriver 内部
   */
  setTimeout?: CreateTimeoutDriverOptions['setTimeout'];
  clearTimeout?: CreateTimeoutDriverOptions['clearTimeout'];

  /**
   * 是否返回 enhanced driver（shared hub）
   * - false/undefined：返回 base driver（raf 优先，其次 timeout，否则 none）
   * - true：返回 shared driver（内部以 baseDriver 为底座做增强）
   */
  shared?: boolean;

  /**
   * shared driver 的选项（仅 shared=true 时生效）
   */
  sharedOptions?: Omit<Parameters<typeof createSharedFrameDriver>[0], 'baseDriver'>;
}

/**
 * createFrameDriver
 *
 * 组装/选择层：
 * - 优先尝试 RAF driver
 * - RAF 不可用时按 fallback 策略尝试 timeout driver
 * - 都不可用则返回 none driver（no-op）
 *
 * 注意：
 * - 本函数不做任何 globalThis 探测；探测逻辑在 base drivers 内部
 */
export function createFrameDriver(options: CreateFrameDriverOptions = {}): FrameDriver {
  const fallback: 'timeout' | 'none' = options.fallback ?? 'timeout';

  // 1) 尝试 RAF driver
  const raf = createRafDriver({
    requestAnimationFrame: options.requestAnimationFrame,
    cancelAnimationFrame: options.cancelAnimationFrame,
    now: options.now,
    type: 'raf',
  });

  let base: FrameDriver | undefined = raf;

  // 2) RAF 不可用：尝试 timeout fallback
  if (!base && fallback === 'timeout') {
    base = createTimeoutDriver({
      setTimeout: options.setTimeout,
      clearTimeout: options.clearTimeout,
      delay: options.fallbackDelay ?? 16,
      now: options.now,
      type: 'timeout',
    });
  }

  // 3) fallback === 'none' 或 timeout 也不可用：返回 no-op driver
  if (!base) {
    const now = options.now ?? (() => Date.now());
    base = {
      type: 'none',
      now,
      request: () => 0,
      cancel: () => {},
    };
  }

  // 4) enhanced：shared hub（增强版 driver）
  if (options.shared) {
    return createSharedFrameDriver({
      baseDriver: base,
      ...(options.sharedOptions ?? {}),
    });
  }

  return base;
}

export default createFrameDriver;
