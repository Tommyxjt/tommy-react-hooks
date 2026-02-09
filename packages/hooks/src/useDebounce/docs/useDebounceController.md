---
nav:
  path: /hooks
---

# useDebounceController

useDebounceController 是 useDebounce 系列的核心调度器，用于在 React 中以“控制器”模式实现 debounce 行为。

它的定位是：你提供一个 invoke(payload, meta) 回调，controller 负责：

- 管理 debounce 周期（cycle）
- 维护最新 payload（lastPayload）
- 调度 leading / trailing / maxWait / flush 的触发时机
- 暴露 pending 状态，以及 cancel / flush / emit 等动作

适用场景：

- 你需要在一个 Hook 内部复用同一套 debounce 调度逻辑（例如 useDebouncedState / useDebouncedEffect / useDebouncedCallback / useDebouncedClick）
- 你需要更细粒度控制（leading/trailing/maxWait/skipInitial/flush/cancel）但又不希望对外暴露一堆“过度设计”的选项
- 你希望把“事件调度”和“具体业务副作用”解耦（更容易测试、更容易组合）

---

## 何时使用

### 适合 useDebounceController 的场景

- 你要封装一个业务 Hook：内部有多个触发源（onChange/onBlur/onSubmit/routeLeave）但要共享同一套 debounce 状态机
- 你要把某种交互抽象成可复用能力：例如防重复点击（leading=true + trailing=false）、合并上报（trailing=true）、自动保存（trailing=true + flush）、滑块验证（trailing=true + cleanup 忽略旧结果）
- 你希望自定义 meta（reason/at），在日志、埋点、调试中追踪触发来源

### 不适合直接用的场景

- 你只是想快速在组件里做个简单防抖：优先用封装好的 useDebouncedCallback / useDebouncedEffect / useDebouncedState 等更高层 Hook
- 你需要固定频率执行（节流）：应使用节流相关 Hook（例如 useThrottledCallback）或自定义 throttle controller

---

## API

useDebounceController 的基本形态如下：

```typescript
type DebounceControllerInvokeReason = 'leading' | 'trailing' | 'flush' | 'maxWait';

interface DebounceControllerInvokeMeta {
  reason: DebounceControllerInvokeReason;
  at: number; // 触发时间戳（performance.now 优先，否则 Date.now）
}

interface DebounceControllerOptions {
  delay?: number;
  leading?: boolean;
  trailing?: boolean;
  skipInitial?: boolean;
  maxWait?: number;
}

interface DebounceControllerActions<P> {
  emit(payload: P): void;
  cancel(): void;
  flush(): void;
  pending: boolean;
  getLastPayload(): P | undefined;
}

function useDebounceController<P>(
  invoke: (payload: P, meta: DebounceControllerInvokeMeta) => void,
  options?: DebounceControllerOptions,
): DebounceControllerActions<P>;
```

---

## 参数详解

### 1）invoke(payload, meta)

这是“真正执行副作用/更新逻辑”的地方，由 controller 在特定时机调用。

- payload：由 emit(payload) 传入，controller 会始终保存“最后一次 payload”
- meta：描述这次 invoke 的触发原因与触发时间，便于调试/埋点

meta.reason 取值：

- leading：新一轮 debounce 周期开始的第一次 emit，且 leading=true
- trailing：停止触发 delay 毫秒后执行（标准 debounce 尾触发）
- flush：用户显式调用 flush() 强制执行最后一次待触发调用
- maxWait：连续触发时间过长，被 maxWait 强制触发一次

meta.at：

- 使用 performance.now（在浏览器环境/支持时更精确）
- 否则退化为 Date.now（兼容 node / jsdom）

### 2）options.delay

防抖间隔（毫秒），默认 500ms。

行为说明：

- 每一次 emit 都会重置 trailing 计时器（标准 debounce）
- delay 会被规范化为非负数（Math.max(0, delay)）

建议值：

- 输入联想/搜索：200~500ms
- 表单校验：300~800ms
- 自动保存：800~2000ms
- 重型计算：取决于可接受延迟与性能消耗

### 3）options.leading

是否在“新一轮 debounce 周期的第一次 emit”立即触发 invoke。

默认 false。

行为说明：

- leading 只会在 startingNewCycle 时触发一次
- leading 触发后会被视为“已消费 payload”
  - controller 会把 hasUnconsumedPayloadRef 标记为 false
  - 目的是避免“只有一次 emit，却同时触发 leading + trailing”造成重复副作用

典型用法：

- 防重复点击：leading=true、trailing=false（第一次立即执行，窗口期内拦截）
- 搜索联想体验优化：leading=true、trailing=true（先快后稳：先立即给出一次结果，再在停顿后给最终稳定值）

### 4）options.trailing

是否在“停止触发 delay 毫秒后”执行 invoke。

默认 true。

行为说明：

- trailing 只有在存在“未被消费的新 payload”时才会触发
  - 即 hasUnconsumedPayloadRef.current === true
- 如果 leading 在本轮已经消费过 payload，并且后续没有新的 emit，
  - trailing 不会重复触发（避免无意义重复）

典型用法：

- 标准 debounce：leading=false、trailing=true
- 防重复点击：leading=true、trailing=false

### 5）options.skipInitial

是否跳过“整个生命周期的第一次 emit”。

默认 false。

行为说明：

- skipInitial=true 时，第一次 emit 会被完全忽略：
  - 不触发 leading
  - 不触发 trailing
  - 不进入 pending（不会启动 cycle）
- 只跳过一次：didSkipInitialOnceRef 在整个生命周期只会变更一次，不会被 reset

适用场景：

- 你在组件初始化时会触发一次 emit（例如受控输入初始化同步、表单初始化回填），但不希望这一轮触发副作用
- 你想避免“首屏进入就自动触发一次请求/保存/上报”

不适用场景：

- 对 value 型 Hook（例如 useDebouncedState）通常不建议暴露 skipInitial，因为会迫使用户处理 undefined 或额外分支
- 对 effect 型 Hook（例如 useDebouncedEffect）更常见

### 6）options.maxWait

“以 debounce 为主，但提供节流兜底”的选项。

当连续触发持续不断时，debounce 可能很久不触发 trailing；maxWait 可以保证：

- 在一轮连续调用中，最多等待 maxWait 毫秒就强制触发一次 invoke（reason=maxWait）

行为说明（结合当前实现）：

- maxWait 以“cycle（防抖轮次）”为单位：仅在新 cycle 开始时启动一次计时器
- 后续 emit 不会重置 maxWait 计时器（区别于 delay）
- maxWait 触发时本质上相当于“强制执行一次 trailing”
  - 因此同样受 trailing 与 hasUnconsumedPayloadRef 约束：
    - trailing=true 且存在未消费 payload 才会 invoke
- maxWait 触发后不会 endCycle
  - 仍保持 pending
  - 并尝试重启下一轮 maxWait（用于长时间持续触发的情况）

注意：

- maxWait 更像“兜底”，不是节流的最佳形态
- 如果你要固定频率执行，请使用节流 Hook（例如 useThrottledCallback）或单独的 throttle controller

---

## Actions（返回值）详解

### 1）emit(payload)

“发射一次事件”，驱动 controller 调度。

核心规则：

- 永远以“最后一次 payload”为准（trailing/flush/maxWait 都取 lastPayload）
- 每次 emit 都会：
  - 更新 lastPayloadRef
  - 标记 hasUnconsumedPayloadRef=true
  - 重置 trailing timer
- 如果这是新 cycle 的第一次 emit：
  - pending 进入 true
  - 记录 cycleStartAt（内部使用）
  - 如果 leading=true，会立即 invoke（reason=leading）
  - 如果配置了 maxWait，会启动 maxWait timer

### 2）cancel()

取消本轮尚未触发的 trailing/maxWait，并结束当前 cycle。

行为说明：

- 清除 trailing/maxWait 两个计时器
- pending=false（同时更新 state 与 ref，确保 UI 正确刷新）
- 清空 hasUnconsumedPayloadRef
- 重置 cycleStartAt
- 不会清空 lastPayloadRef（仍可通过 getLastPayload 读取最后一次 payload）

典型用法：

- 输入突然清空：取消待请求/待保存
- 请求失败后希望用户立刻重试：用于防重复点击场景相当于 reset
- 组件卸载时清理：内部 useUnmount(cancel) 会自动执行

### 3）flush()

立刻执行“本来会在 trailing 执行的那一次”（如果存在）。

行为说明：

- 只有在 pending=true 且存在未消费 payload 时才会 invoke
  - 防止重复副作用：如果没有待执行的一次，flush 不会无意义再执行
- invoke 的 reason=flush
- 执行后 endCycle：清除计时器并把 pending 复位为 false

典型用法：

- onBlur：离开输入框前确保保存/上报
- submit：提交前确保最后一次变更已落库
- routeLeave：路由切换前确保写入（如果你选择这样设计）

### 4）pending

是否处于防抖期（存在尚未触发或尚未结束的 debounce cycle）。

当前实现的关键点：

- pending 由 state 驱动以保证 UI 更新
- 同时通过 pendingRef 维持“同步可读的最新值”，避免定时器回调闭包取到旧 pending
- 适合用于：
  - 禁用按钮
  - 显示 loading / “正在输入中”
  - 判断是否需要 flush/cancel

### 5）getLastPayload()

获取最后一次 emit 的 payload。

说明：

- 即使 cancel/endCycle 后也不会被清空（除非你自行覆盖）
- 常用于 flush 前后调试、记录最后一次输入、或把 payload 取出做额外判断

---

## 触发时序与行为总结

### 标准 debounce（最常用）

- leading=false, trailing=true
- 连续 emit → 只在停顿 delay 后执行最后一次

### 先快后稳（体验优化）

- leading=true, trailing=true
- 新 cycle 第一次 emit 立刻执行一次；停顿后再执行最后一次稳定值

### 防重复点击（点击窗口期拦截）

- leading=true, trailing=false
- 第一次点击立即执行；窗口期内后续 emit 不会再次执行
- pending 的“结束恢复”依赖 endCycle 时 setPending(false) 触发 rerender

### skipInitial（跳过首次触发）

- 第一次 emit 被完全忽略（不触发、不 pending）
- 从第二次开始正常进入 cycle

### maxWait（连续触发兜底）

- 连续 emit 即使一直不停，也能在 maxWait 到期时强制执行一次（如果有未消费 payload）
- 仍保持 pending，后续继续按 debounce 的 trailing 逻辑结束 cycle

---

## 注意事项与最佳实践

1）invoke 内部应尽量可重入/可取消

- 若 invoke 触发异步请求，建议在上层 Hook 做“忽略旧结果”的 cleanup（例如标记 cancelled）
- controller 本身只负责调度，不负责取消异步任务

2）对外封装时避免过度暴露选项

- 高层 Hook 可以只暴露业务需要的少量 options
- controller 保留为“强能力”底座

3）测试环境时间源

- meta.at 在浏览器里更可能来自 performance.now
- 在 node/jsdom 环境可能退化为 Date.now
- 若测试依赖时间精度，请注意这一点

4）pending 的语义是“是否处于 debounce cycle”

- 不是“是否有异步任务在跑”
- 异步任务 loading 应由业务层另外维护（或结合 pending + 自己的 loading）

---

## 封装示例

### 基于 useDebounceController 二次封装的自定义 Hook 示例（MVP 级别）

```typescript
/**
 * useDebouncedValue（MVP）
 *
 * 使用场景：
 * - 你已经有一个即时 value（例如 input 的受控值）
 * - 你还需要一个 debouncedValue 给下游（请求 / 昂贵计算 / effect 依赖）
 */
export function useDebouncedValue<T>(
  value: T,
  options: UseDebouncedValueOptions = {},
): readonly [debouncedValue: T, actions: UseDebouncedValueActions] {
  const { delay = 500, leading = false, skipInitial = false } = options;

  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  // controller：负责调度 leading/trailing/flush/cancel/pending
  const controller = useDebounceController<T>(
    (payload) => {
      setDebouncedValue(payload);
    },
    {
      delay,
      leading,
      trailing: true,
      skipInitial,
    },
  );

  // value 变化 → emit 最新值（由 controller 做防抖）
  useEffect(() => {
    controller.emit(value);
  }, [value, controller]);

  const actions = useMemo<UseDebouncedValueActions>(
    () => ({
      cancel: controller.cancel,
      flush: controller.flush,
      get pending() {
        return controller.pending;
      },
    }),
    [controller],
  );

  return [debouncedValue, actions] as const;
}

export default useDebouncedValue;
```
