import { useCallback, useMemo } from 'react';
import { useLatestRef } from '../../_internal/react/useLatestRef';
import useDebounceController from '../core/useDebounceController';

export interface UseDebouncedCallbackOptions {
  /**
   * 防抖间隔，默认 500ms
   * 常见：输入相关请求/联想建议 200~500ms；自动保存 800~2000ms
   */
  delay?: number;

  /**
   * 主体是 debounce 场景，但是做节流兜底
   * ⚠️ 提供，但是不推荐，固定频率执行使用 @see useThrottledCallback
   */
  maxWait?: number;
}

export interface UseDebouncedCallbackActions {
  /**
   * 取消本轮尚未触发的调用
   */
  cancel: () => void;

  /**
   * 立刻执行“最后一次待触发的调用”
   * 常见：onBlur / submit / 页面切走前确保上报或者保存
   */
  flush: () => void;

  /**
   * 是否存在尚未触发的调用
   */
  readonly pending: boolean;
}

/**
 * useDebouncedCallback
 *
 * 专注于 “频繁触发，只执行最后一次”。
 * 按钮防重复点击使用 @see useDebouncedClick
 * 其他更复杂需求请直接使用 @see useDebounceController 进行自定义包装。
 *
 * 使用场景：
 * - 自动保存（autosave）：表单频繁变更，只在停顿后保存一次
 * - 埋点 / 日志：短时间内重复事件合并上报
 */
function useDebouncedCallback<F extends (...args: any[]) => any>(
  fn: F,
  options: UseDebouncedCallbackOptions = {},
): readonly [(...args: Parameters<F>) => void, UseDebouncedCallbackActions] {
  const { delay = 500, maxWait } = options;

  // 防止闭包陷阱：确保 invoke 时取到最新 fn
  const fnRef = useLatestRef(fn);

  // controller 的 payload 选用 “参数元组”，可覆盖任意函数签名
  const controller = useDebounceController<Parameters<F>>(
    (args) => {
      fnRef.current(...args);
    },
    {
      delay,
      // useDebouncedCallback 的定位是“最后一次生效”，固定 trailing=true、leading=false
      leading: false,
      trailing: true,
      maxWait,
    },
  );

  const debouncedCallback = useCallback(
    (...args: Parameters<F>) => {
      controller.emit(args);
    },
    [controller],
  );

  const actions = useMemo<UseDebouncedCallbackActions>(
    () => ({
      cancel: controller.cancel,
      flush: controller.flush,
      get pending() {
        return controller.pending;
      },
    }),
    [controller],
  );

  return [debouncedCallback, actions] as const;
}

export default useDebouncedCallback;
