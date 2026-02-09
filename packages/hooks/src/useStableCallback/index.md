---
nav:
  path: /hooks
---

# useStableCallback

返回一个“引用稳定”的回调函数，但内部始终调用最新的实现，用于同时解决：

- **闭包陷阱**：订阅/定时器/事件回调里读取到旧 state
- **频繁重订阅**：为了拿到最新逻辑使用 useCallback([deps])，导致 effect 依赖变动、解绑/重绑抖动

useStableCallback 可以理解为对 useCallback 的一种封装：它的目标不是“缓存函数”，而是提供 **稳定引用 + 最新逻辑** 的组合能力。

## 何时使用

### 设计思路

在 React 中，以下场景很常见：

- 你需要把一个回调传给订阅系统（window 事件、WebSocket、Emitter、IntersectionObserver、ResizeObserver...）
- 订阅通常只希望注册一次，否则会不断解绑/重绑
- 但回调又必须读取到最新的 state/props，否则会产生闭包问题

useStableCallback 的行为可以用一句话概括：

- **返回的函数引用永远不变**
- **执行时取到最新的 fn，并调用它**

### 使用场景

- 事件监听：keydown/scroll/resize 等
- 定时器：setInterval 里要访问最新状态
- 订阅/观察者：Emitter / WebSocket / Observer 的回调
- 传递给子组件：子组件 useEffect 依赖 callback，但你不希望频繁触发 cleanup/subscribe

## 代码演示

<code src="./demo/basic.tsx"></code>

<code src="./demo/performance.tsx"></code>

## API

```typescript
const stableFn = useStableCallback(fn);
```

### Params

| 参数 | 说明                           | 类型                      | 默认值 |
| ---- | ------------------------------ | ------------------------- | ------ |
| fn   | 任意函数，可能依赖 state/props | `(...args: any[]) => any` | -      |

### Result

| 参数     | 说明                                | 类型                      |
| -------- | ----------------------------------- | ------------------------- |
| stableFn | 引用稳定的函数，内部始终调用最新 fn | `(...args: any[]) => any` |

## FAQ

### 1）它是不是 useCallback 的「全量上位替代」？

##### 不建议把 useStableCallback 当成 useCallback 的“全量上位替代”。它确实在很多场景更好用，但两者的语义不一样：

- useCallback：在依赖不变时保持函数引用不变（一种 “缓存”/“记忆化” 语义）

- useStableCallback：函数引用永远不变，但函数内部逻辑永远最新（一种 “稳定门面 + 最新实现” 语义）

##### 这两个语义在一些场景可以互换，但在另一些场景会改变行为，甚至让 bug 更隐蔽。

### 2）哪些场景不适合用 useStableCallback？

##### A）你需要 “依赖变化时回调引用也变化” 来触发某些机制

    有些代码把 fn 的引用变化当成“信号”，比如：

    - 依赖 fn 的 useEffect 需要在 fn 变化时重新执行

    - 某些缓存/比较逻辑依赖 fn 引用变化来失效

    用 useStableCallback 会让引用永远不变，这类机制就不会触发了。

##### B）你需要 “在依赖不变时才保持稳定”，而依赖变化代表 “新语义”

    useCallback 的依赖数组有时候是“声明式边界”：

    - 依赖不变 → 语义不变 → 允许复用旧函数

    - 依赖变化 → 语义变化 → 你希望下游知道“这不是同一个 handler 了”

    useStableCallback 会把“语义变化”隐藏在内部实现里：下游看不到引用变化，只能靠其他信号。
