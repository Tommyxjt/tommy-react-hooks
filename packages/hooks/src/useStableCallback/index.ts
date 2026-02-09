import useStableCallbackInternal from '../_internal/react/useStableCallback';

/**
 * useStableCallback（Public）
 *
 * 返回一个引用稳定的函数，但内部始终调用最新的 fn。
 */
const useStableCallback = useStableCallbackInternal;

export default useStableCallback;
