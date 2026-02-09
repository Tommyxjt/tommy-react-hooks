---
nav:
  path: /hooks
---

# useDebouncedState

用于「防抖状态」的 Hook：提供一个即时值 state（用于受控输入），以及一个防抖值 debouncedState（用于请求 / 昂贵计算 / effect 依赖），并附带 cancel / flush / pending 等控制能力。

---

## 何时使用

### 设计思路

- 即时值与防抖值同时提供：state 负责 UI 实时响应；debouncedState 负责“稳定后再参与下游逻辑”。
- 以三元组形式暴露能力，更接近 useState 的使用习惯：直接拿到 state 与 setState，同时通过 controls 获取 debouncedState 与控制方法。
- 支持 leading：在一轮连续输入开始时允许立即产出一次 debouncedState（让页面更快展示），同时仍保留 trailing 的最终稳定值更新。

### 使用场景

- 防抖输入框：受控输入 + 延迟请求（搜索联想、筛选列表、远程下拉选项等）
- 防抖校验：输入停止后再触发校验（用户名可用性、邮箱格式/服务端校验等）
- 防抖计算：输入停止后再做昂贵计算（例如大列表过滤、复杂派生数据计算）
- 需要“防抖后的值”作为一等公民的数据流：要渲染/要复用/要往下传（props/上下文）

---

## 代码演示

<code src="../demo/useDebouncedState/basic.tsx"></code>

<code src="../demo/useDebouncedState/autoValidate.tsx"></code>

<code src="../demo/useDebouncedState/leading.tsx"></code>

---

## API

```typescript
const [state, setState, controls] = useDebouncedState<T>(
  initialValue: T,
  options?: UseDebouncedStateOptions,
);
```

### Params

| 参数         | 说明   | 类型                                  | 默认值                                      |
| ------------ | ------ | ------------------------------------- | ------------------------------------------- |
| initialValue | 初始值 | <code>T</code>                        | -                                           |
| options      | 配置项 | <code>UseDebouncedStateOptions</code> | <code>{ delay: 500, leading: false }</code> |

### UseDebouncedStateOptions

| 参数    | 说明                                              | 类型                 | 默认值 |
| ------- | ------------------------------------------------- | -------------------- | ------ |
| delay   | 防抖间隔（毫秒）。输入框场景通常 200~500ms        | <code>number</code>  | 500    |
| leading | 一轮连续输入开始时是否立即产出一次 debouncedState | <code>boolean</code> | false  |

### Result（三元组）

| 位置 | 名称     | 说明                         | 类型                                                          |
| ---- | -------- | ---------------------------- | ------------------------------------------------------------- |
| 0    | state    | 即时值：适合绑定 input value | <code>T</code>                                                |
| 1    | setState | 设置即时值，并调度防抖更新   | <code>(next: React.SetStateAction&lt;T&gt;) =&gt; void</code> |
| 2    | controls | 防抖相关状态与操作集合       | <code>UseDebouncedStateControls&lt;T&gt;</code>               |

### UseDebouncedStateControls

| 参数           | 说明                                                        | 类型                       |
| -------------- | ----------------------------------------------------------- | -------------------------- |
| debouncedState | 防抖值：适合用于请求 / 昂贵计算 / effect 依赖               | <code>T</code>             |
| cancel         | 取消本轮尚未触发的防抖更新（例如突然清空输入）              | <code>() =&gt; void</code> |
| flush          | 立刻把 debouncedState 更新为最新值（例如 Enter / 点击搜索） | <code>() =&gt; void</code> |
| pending        | 是否存在尚未触发的防抖更新（可用于“正在输入中/加载中”提示） | <code>boolean</code>       |

---

## FAQ

### 1）useDebouncedState 和 useDebouncedEffect 的区别是什么？

- useDebouncedState：当你需要一个防抖后的值（debouncedState）参与渲染、复用、下传，或被多个逻辑共同依赖时更合适。
- useDebouncedEffect：当你只想防抖某个副作用（请求/写入/上报），并不需要“防抖后的值本身”时更合适。

经验法则：

- 需要“防抖值”作为数据流的一部分 → 用 useDebouncedState
- 只想防抖“副作用触发” → 用 useDebouncedEffect

### 2）leading 打开后会发生什么？会不会触发两次？

当前实现中 controller 配置为 leading + trailing（trailing 固定为 true）：

- leading=true 时：一轮连续输入开始时可能立即更新一次 debouncedState，让页面更快显示（例如快速展示搜索联想）
- 如果这一轮里继续输入：在停止输入 delay 毫秒后，仍会再更新一次 debouncedState（trailing 的最终稳定值）

因此在“一轮输入里发生多次变化”的情况下，leading 可能带来“先快后稳”的两次更新，这是预期行为。

### 3）pending 适合做什么？

pending 适合用于展示“正在输入中/正在等待稳定值”的 UI 提示，例如：

- 输入框右侧提示：正在输入…
- 列表区域显示 loading（表示结果仍可能被新的输入覆盖）
- 禁用“提交/搜索”按钮直到稳定（也可以结合 flush 实现立即提交）

### 4）为什么不提供 skipInitial？

useDebouncedState 的 debouncedState 是一个值，初始值通常应该可用且可预测（默认等于 initialValue）。是否跳过首次触发副作用，属于 effect 层面的需求，更适合在 useEffect/useDebouncedEffect 或通用的“仅更新时触发”工具里处理，而不是让值本身变成 undefined 或引入额外分支。
