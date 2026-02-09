---
nav:
  path: /hooks
---

# useDebouncedCallback

用于把“频繁触发的回调”合并成“只执行最后一次”的 Hook。适合自动保存、埋点合并上报、输入联想请求等场景。

---

## 何时使用

### 设计思路

- 专注于“最后一次生效”：固定 trailing=true、leading=false，确保一段时间内多次触发只执行最后一次。
- 以回调为中心：适合同一个逻辑可能来自多个入口触发（onChange / onBlur / submit / 页面切走等），用一个 debounced callback 统一管理。
- 提供 cancel/flush：允许取消待触发调用，或在关键时机立刻执行最后一次待触发调用（例如 onBlur / submit / 页面切走前）。

### 使用场景

- 自动保存（autosave）：表单频繁变更，只在停顿后保存一次；并在失焦或提交时 flush，确保不丢数据。
- 埋点/日志合并：短时间内重复事件合并上报，只上报最后一次（或最后一次的参数集合由你决定）。
- 输入联想请求：频繁输入只请求最后一次，避免无意义请求堆积。

---

## 代码演示

<code src="../demo/useDebouncedCallback/autoSave.tsx"></code>

---

## API

```typescript
const [debouncedCallback, actions] = useDebouncedCallback<F>(fn, options);

debouncedCallback(...args);

actions.cancel();
actions.flush();
actions.pending;
```

### Params

| 参数    | 说明                                       | 类型                                     | 默认值                      |
| ------- | ------------------------------------------ | ---------------------------------------- | --------------------------- |
| fn      | 需要防抖的回调函数（任意签名，参数会透传） | <code>F</code>                           | -                           |
| options | 配置项                                     | <code>UseDebouncedCallbackOptions</code> | <code>{ delay: 500 }</code> |

### UseDebouncedCallbackOptions

| 参数    | 说明                                                                                                            | 类型                | 默认值 |
| ------- | --------------------------------------------------------------------------------------------------------------- | ------------------- | ------ |
| delay   | 防抖间隔（毫秒）。输入相关请求/联想建议常用 200\~500ms；自动保存常用 800\~2000ms                                | <code>number</code> | 500    |
| maxWait | 防抖为主，但做节流兜底：连续触发时最多等待多久就强制触发一次。提供但不推荐；固定频率请使用 useThrottledCallback | <code>number</code> | -      |

### Result

| 位置 | 名称              | 说明                     | 类型                                                   |
| ---- | ----------------- | ------------------------ | ------------------------------------------------------ |
| 0    | debouncedCallback | 防抖后的回调（参数透传） | <code>(...args: Parameters&lt;F&gt;) =&gt; void</code> |
| 1    | actions           | 控制与状态               | <code>UseDebouncedCallbackActions</code>               |

### UseDebouncedCallbackActions

| 参数    | 说明                                                                             | 类型                       |
| ------- | -------------------------------------------------------------------------------- | -------------------------- |
| cancel  | 取消本轮尚未触发的调用                                                           | <code>() =&gt; void</code> |
| flush   | 立刻执行最后一次待触发的调用（常见：onBlur / submit / 页面切走前确保保存或上报） | <code>() =&gt; void</code> |
| pending | 是否存在尚未触发的调用                                                           | <code>boolean</code>       |

---

## FAQ

### 1）为什么这个场景用 useDebouncedCallback 最合适？

当你的“保存/上报/请求”逻辑会从多个入口触发（例如输入变更、失焦、点击保存、提交、页面切走），而你又希望它们共享同一套防抖、取消与强制执行策略时，useDebouncedCallback 能把这些入口统一到一个 debounced callback 上，使用上更直接，也更不容易写散。

### 2）它和 useDebouncedEffect 的区别是什么？

- useDebouncedCallback：防抖的是回调本身，适合多入口触发同一逻辑，并需要 cancel/flush。
- useDebouncedEffect：防抖的是副作用触发时机，适合依赖变化后延迟执行 effect，但不强调“回调多入口触发”。

### 3）什么时候需要 maxWait？

maxWait 是为极端场景做兜底：如果事件持续不断触发，debounce 可能很久不执行；maxWait 可以保证“最长多久也会触发一次”。如果你要固定频率触发，更推荐用节流类 Hook（例如 useThrottledCallback）。
