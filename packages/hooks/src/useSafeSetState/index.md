---
nav:
  path: /hooks
---

# useSafeSetState

用于在组件卸载后，安全地忽略 setState 调用，避免 React 关于“卸载后更新状态”的警告与潜在逻辑问题。

## 何时使用

典型问题：你触发了一个不可取消的异步回调（例如 Promise.then、某些第三方 SDK 回调）。当回调返回时，组件可能已经卸载（路由切走、条件渲染关闭），如果此时继续 setState，可能出现：

- React 警告：尝试更新已卸载组件
- 业务副作用：卸载页面仍然写入数据、更新 UI 状态、触发后续 effect

useSafeSetState 的思路很直接：它返回的 setState 在执行前会判断组件是否仍处于 mounted 状态；如果已卸载，则直接忽略本次更新。

提示：如果副作用本身可取消（定时器、订阅、事件监听），优先使用 cleanup（useEffect return / useUnmount）主动清理。useSafeSetState 更适合“无法可靠取消，只能忽略回调”的场景。

## 代码演示

<code src="./demo/basic.tsx"></code>

## API

```typescript
const [state, setState] = useSafeSetState(initialState);
```

### Params

| 参数         | 说明                      | 类型             | 默认值 |
| ------------ | ------------------------- | ---------------- | ------ |
| initialState | 初始状态值（同 useState） | `T   \| () => T` | -      |

### Result

| 参数     | 说明                                | 类型                                      |
| -------- | ----------------------------------- | ----------------------------------------- |
| state    | 当前状态值                          | `T`                                       |
| setState | 安全的 setState：卸载后调用会被忽略 | `React.Dispatch<React.SetStateAction<T>>` |

## FAQ

### 1）它会取消我的异步任务吗？

不会。它只是在异步回调最终触发时，避免卸载后继续更新状态。是否要取消异步任务，需要你自己在 cleanup 中处理（如果可取消）。

### 2）它和 useIsMounted 的区别是什么？

- useIsMounted：提供一个判断函数，你可以决定是否继续执行任何逻辑（不仅是 setState）
- useSafeSetState：只保护 setState（更省心的默认方案）
