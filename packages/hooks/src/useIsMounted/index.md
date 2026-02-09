---
nav:
  path: /hooks
---

# useIsMounted

用于判断组件当前是否仍处于挂载状态（mounted）的 Hook。

## 何时使用

### 设计思路

在 React 中，异步任务（Promise / setTimeout / 事件订阅回调等）可能在组件卸载后才返回结果。此时如果继续执行 `setState`，会产生：

- React 警告：对已卸载组件更新状态
- 逻辑错误：卸载页面仍然写入数据、弹 Toast、触发副作用

`useIsMounted` 返回一个函数 `isMounted()`，你可以在异步回调里做一次轻量判断：

- `true`：组件仍在 → 允许更新状态/提示
- `false`：组件已卸载 → 忽略本次回调（安全退出）

### 使用场景

- **请求回调**：请求返回时组件可能已经被卸载（路由跳转、条件渲染切换）
- **不可取消的异步任务**：Promise 无法像定时器一样可靠取消，只能在回调里判断
- **订阅/事件回调**：外部事件触发时组件可能已经不存在

> 提示：如果异步任务本身支持取消（例如可清理的定时器/订阅），优先使用 cleanup（例如配合 useUnmount 清理）。useIsMounted 更适合 “无法取消，只能忽略回调” 的场景。

## 代码演示

<code src="./demo/basic.tsx"></code>

## API

```typescript
const isMounted = useIsMounted();

isMounted(); // => boolean
```

### Params

无。

### Result

| 参数        | 说明                           | 类型            |
| ----------- | ------------------------------ | --------------- |
| isMounted() | 判断组件当前是否仍处于 mounted | `() => boolean` |

## FAQ

### 1）为什么返回的是函数，而不是 getter？

- getter 很容易被 “提前求值”

  假设你做成这样（伪代码）：

  `useIsMounted()` 返回 `{ get value() { return mountedRef.current } }`

  在组件里大家很容易写：

  ```typescript
  const { value: mounted } = useIsMounted();
  ```

  这一步会立刻触发 getter 求值，然后 `mounted` 就是一个普通 `boolean`，被固定在那一刻了。之后异步回调里用的还是旧值（跟直接返回 boolean 没区别）。

而返回函数 `isMounted()` 可以在任何时刻读取到“最新状态”。

### 2）useIsMounted 和 useSafeSetState 有什么区别？

- useIsMounted：给你一个“判断开关”，你可以在回调里决定要不要继续做事（不仅是 setState，也可能是 message、埋点等）。
- useSafeSetState：只保护 setState，不让它在卸载后执行；但其他副作用（例如 message、日志）仍需要你自己控制。

### 3）我是不是应该用它来替代所有 cleanup？

不建议。能取消 / 能清理的副作用（计时器、订阅、事件监听）应优先用 cleanup（例如 useEffect return / useUnmount）。useIsMounted 更适合不可取消的异步回调（Promise）场景。
