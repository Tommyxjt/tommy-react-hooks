---
nav:
  path: /hooks
---

# useDebouncedEffect

用于「防抖版 useEffect」的 Hook：当依赖频繁变化时，将副作用延后到用户停止操作一段时间后再执行，从而减少无意义的请求/计算/写入。

---

## 何时使用

### 设计思路

- **把“防抖”绑定到副作用，而不是绑定到状态值**：你不需要先得到一个 debounced value 再用 `useEffect` 监听它；直接在副作用层面防抖更自然。
- **减少 render 负担**：相比 “`useDebouncedState` + `useEffect`”，这里通常不会引入额外的「debouncedState」render 过程（副作用触发与 UI 状态解耦）。
- **对清理（cleanup）更友好**：当 effect 真的执行时，返回的 cleanup 仍然遵循 `useEffect` 语义（下一次执行/卸载时清理）。

### 使用场景

- **输入联想 / 搜索建议**：用户输入时频繁变更，停止输入后再请求。
- **自动保存（autosave）**：编辑器内容频繁变化，停止编辑一段时间后保存。
- **昂贵副作用**：例如写入 localStorage、埋点上报、计算/同步到外部系统等。
- **需要避免「每次变更都触发 effect」** 的任意场景：当“最终稳定值”才有意义。

---

## 代码演示

<code src="../demo/useDebouncedEffect/basic.tsx"></code>

<code src="../demo/useDebouncedEffect/autoSave.tsx"></code>

<code src="../demo/useDebouncedEffect/skipInitial.tsx"></code>

<code src="../demo/useDebouncedEffect/sliderCaptcha.tsx"></code>

---

## API

```typescript
useDebouncedEffect(
  effect: () => (() => void) | undefined,
  deps: React.DependencyList,
  options?: {
    delay?: number;       // 防抖间隔，默认 500ms
    leading?: boolean;    // 是否在一轮开始时立即执行一次（默认 false）
    skipInitial?: boolean;// 是否跳过初次渲染（默认 false）
  },
): void
```

### Params

| 参数    | 说明                         | 类型                         | 默认值                               |
| ------- | ---------------------------- | ---------------------------- | ------------------------------------ |
| effect  | 副作用函数（可返回 cleanup） | `() => void \| (() => void)` | -                                    |
| deps    | 依赖数组（同 useEffect）     | `React.DependencyList`       | -                                    |
| options | 配置项                       | `options`                    | `{ delay: 500, skipInitial: false }` |

### Options

| 参数        | 说明                           | 类型      | 默认值  |
| ----------- | ------------------------------ | --------- | ------- |
| delay       | 防抖间隔                       | `number`  | `500`   |
| skipInitial | 是否跳过首次渲染的 effect 执行 | `boolean` | `false` |

---

## FAQ

### 1）useDebouncedEffect + useState 和 useDebouncedState + useEffect 有什么区别？

它们本质上解决的是两类不同问题：

- **useDebouncedEffect + useState**：你有“即时 UI 状态”（比如输入框的 value），但你只想让某个副作用（请求、写入、上报）在稳定后发生。

  - 你保留 `useState` 的即时响应（输入框不卡）
  - 你只对副作用做防抖（更直观、额外状态更少）
  - 典型：搜索建议、自动保存、埋点上报

- **useDebouncedState + useEffect**：你需要一个“可被渲染/可复用”的 debounced value（它本身就是 UI/逻辑的一部分），然后再基于它触发 effect。
  - 你获得了一个稳定的 debounced value，可用于渲染与下游逻辑复用
  - 适合多个地方都要用到 debounced value（比如既渲染也请求）
  - 典型：输入框旁边要展示“稳定后的关键词”、或者多处逻辑依赖同一个 debounced 值

一句话区分：

- **只想防抖副作用** → 用 `useDebouncedEffect`
- **想拿到防抖后的值作为一等公民（要渲染/复用）** → 用 `useDebouncedState`

### 2）什么时候更推荐 useDebouncedState，而不是 useDebouncedEffect？

- 你需要把 debounced value 渲染到 UI 上（例如 “当前稳定关键词”）
- 多个 effect/计算都依赖同一个 debounced value（减少重复防抖逻辑）
- 你希望把 “稳定值” 作为数据流的一部分往下传（props/上下文）

### 3）useDebouncedEffect 会不会导致闭包拿到旧值？

只要实现里确保每次执行时调用的是最新的 `effect`（通常通过内部 latestRef 处理），就不会出现“旧 effect”问题。你在使用上仍应像 useEffect 一样：**把依赖放进 deps**，不要依赖隐式闭包。
