---
nav:
  path: /hooks
---

# useDebouncedClick

用于按钮防重复点击的 Hook：第一次点击立即执行，随后在指定窗口期内拦截后续点击。适合防止重复提交、重复请求、重复支付等问题。

---

## 何时使用

### 设计思路

- 只拦截窗口期内的后续点击：第一次点击立即生效（leading=true），后续点击在窗口期内被拦截（trailing=false）。
- 提供 reset：当请求失败或需要立刻允许用户重试时，可以手动重置本轮窗口期。
- 暴露 pending：用于禁用按钮、展示 loading 或提示当前处于拦截期。

### 使用场景

- 表单提交按钮：防止用户连点导致重复提交。
- 发起请求按钮：防止重复触发同一个接口。
- 支付/下单：防止重复扣款或重复创建订单。
- 任意需要防止重复触发的点击入口：例如打开弹窗、触发导出等。

---

## 代码演示

<code src="../demo/useDebouncedClick/basic.tsx"></code>

<code src="../demo/useDebouncedClick/reset.tsx"></code>

<!-- <code src="../demo/useDebouncedClick/pending.tsx"></code> -->

---

## API

```typescript
const [debouncedClick, actions] = useDebouncedClick(onClick, options);

debouncedClick(...args);

actions.reset();
actions.pending;
```

### Params

| 参数    | 说明                                   | 类型                                    | 默认值                      |
| ------- | -------------------------------------- | --------------------------------------- | --------------------------- |
| onClick | 点击回调（任意函数签名，参数会被透传） | <code>(...args: any[]) =&gt; any</code> | -                           |
| options | 配置项                                 | <code>UseDebouncedClickOptions</code>   | <code>{ delay: 500 }</code> |

### UseDebouncedClickOptions

| 参数  | 说明                     | 类型                | 默认值 |
| ----- | ------------------------ | ------------------- | ------ |
| delay | 防重复点击窗口期（毫秒） | <code>number</code> | 500    |

### Result

| 位置 | 名称           | 说明                               | 类型                                                   |
| ---- | -------------- | ---------------------------------- | ------------------------------------------------------ |
| 0    | debouncedClick | 防重复点击后的 handler（参数透传） | <code>(...args: Parameters&lt;F&gt;) =&gt; void</code> |
| 1    | actions        | 控制与状态                         | <code>UseDebouncedClickActions</code>                  |

### UseDebouncedClickActions

| 参数    | 说明                                                                  | 类型                       |
| ------- | --------------------------------------------------------------------- | -------------------------- |
| reset   | 重置本轮窗口期，让下一次点击立刻生效（常见：请求失败后允许立刻重试）  | <code>() =&gt; void</code> |
| pending | 是否处于拦截后续点击的窗口期（常见：禁用按钮、显示 loading 或倒计时） | <code>boolean</code>       |

---

## FAQ

### 1）为什么提供 reset？

很多业务希望：点击后发起请求，如果请求失败，用户可以立刻再次点击重试，而不是等到窗口期结束。reset 就是为这种“失败立即重试”设计的。

### 2）更复杂的点击控制怎么做？

例如需要同时支持 trailing、maxWait、flush 等更复杂控制，请直接使用 useDebounceController 进行自定义封装。
