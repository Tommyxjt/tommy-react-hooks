import { DependencyList, EffectCallback, useEffect, useRef } from 'react';
import { useLatestRef } from '../../_internal/react/useLatestRef';
import { useUnmount } from '../../_internal/react/useUnmount';
import useDebounceController from '../core/useDebounceController';

export interface UseDebouncedEffectOptions {
  /**
   * 防抖间隔，默认 500ms
   */
  delay?: number;

  /**
   * 是否跳过首次执行（只跳过 mount 时那一次 effect 调度/执行）
   * 默认 false
   */
  skipInitial?: boolean;
}

/**
 * useDebouncedEffect
 *
 * “只保留最后一次” 的 effect 防抖（deps 在防抖期内多次变化，只执行最后一次）
 * 上层体验尽量贴近原生 useEffect：支持 cleanup，并在下一次真正执行前先 cleanup 上一次
 *
 * 使用场景：
 * - 依赖多个字段的 autosave（如果一个个用 useDebouncedState 包太笨重了）
 * - 埋点 / 日志上报
 * - 把布局 / scroll / resize 导致的昂贵测量延后（更常见是 throttle，但也会有 debounce 场景：只在用户停止缩放后测一次）
 *
 * 更复杂需求请使用 @see useDebounceController 自定义
 */
function useDebouncedEffect(
  effect: EffectCallback,
  deps: DependencyList,
  options: UseDebouncedEffectOptions = {},
): void {
  const { delay = 500, skipInitial = false } = options;

  // 防止闭包陷阱：effect 变化时仍能执行最新的 effect
  const effectRef = useLatestRef(effect);

  // 保存 “上一次已执行过的 effect” 返回的 cleanup（贴近原生 useEffect 行为）
  const cleanupRef = useRef<(() => void) | undefined>();

  // skipInitial 只跳过一次：第一次 deps 生效不调度
  const didSkipInitialOnceRef = useRef(false);

  // controller payload 用 void：我们只关心“触发一次执行”，不关心参数
  const controller = useDebounceController<undefined>(
    () => {
      // 下一次执行 effect 前，先清理上一次的 cleanup（贴近 useEffect）
      if (typeof cleanupRef.current === 'function') {
        cleanupRef.current();
      }

      const cleanup = effectRef.current();
      cleanupRef.current = typeof cleanup === 'function' ? cleanup : undefined;
    },
    {
      delay,
      leading: false,
      trailing: true,
    },
  );

  useEffect(() => {
    if (skipInitial && !didSkipInitialOnceRef.current) {
      didSkipInitialOnceRef.current = true;
      return;
    }

    // deps 变化：只保留最后一次（emit 会重置 trailing timer）
    controller.emit(undefined);

    // 在 deps 再次变化时，取消上一轮尚未触发的调度（确保“只保留最后一次”）
    return () => {
      controller.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // 组件卸载时：
  // 1) 取消尚未触发的调度（避免卸载后 invoke）
  // 2) 执行最后一次已执行过的 cleanup（贴近 useEffect）
  useUnmount(() => {
    controller.cancel();
    if (typeof cleanupRef.current === 'function') {
      cleanupRef.current();
    }
  });
}

export default useDebouncedEffect;
