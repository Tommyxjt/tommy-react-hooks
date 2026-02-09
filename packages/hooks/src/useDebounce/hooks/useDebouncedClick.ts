import { useCallback, useMemo } from 'react';
import { useLatestRef } from '../../_internal/react/useLatestRef';
import useDebounceController from '../core/useDebounceController';

export interface UseDebouncedClickOptions {
  /**
   * 防重复点击窗口期，默认 500ms
   */
  delay?: number;
}

export interface UseDebouncedClickActions {
  /**
   * 重置本轮点击防抖周期（让下一次点击立刻生效）
   * 常见：请求失败后允许用户立刻重试
   */
  reset: () => void;

  /**
   * 是否处于 “拦截后续点击” 的防抖期
   * 常见：用于 disable 按钮、显示 loading / 倒计时
   */
  readonly pending: boolean;
}

/**
 * useDebouncedClick
 *
 * 使用场景：
 * - 按钮防重复点击：第一次点击立即执行，窗口期内后续点击拦截
 *
 * 更复杂需求请使用 @see useDebounceController 自定义
 */
function useDebouncedClick<F extends (...args: any[]) => any>(
  onClick: F,
  options: UseDebouncedClickOptions = {},
): readonly [(...args: Parameters<F>) => void, UseDebouncedClickActions] {
  const { delay = 500 } = options;

  const onClickRef = useLatestRef(onClick);

  // payload 使用参数元组，确保适配任意签名（包括 event）
  const controller = useDebounceController<Parameters<F>>(
    (args) => {
      onClickRef.current(...args);
    },
    {
      delay,
      leading: true,
      trailing: false,
    },
  );

  const debouncedClick = useCallback(
    (...args: Parameters<F>) => {
      // leading=true 会立刻触发 invoke
      // 后续调用仍会进入 controller，但 trailing=false 会保证后续不会二次触发
      controller.emit(args);
    },
    [controller],
  );

  const actions = useMemo<UseDebouncedClickActions>(
    () => ({
      reset: controller.cancel, // reset 的语义更好
      get pending() {
        return controller.pending;
      },
    }),
    [controller],
  );

  return [debouncedClick, actions] as const;
}

export default useDebouncedClick;
