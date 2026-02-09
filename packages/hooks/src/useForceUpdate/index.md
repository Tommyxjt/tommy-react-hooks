---
nav:
  path: /hooks
---

# useForceUpdate

强制触发组件重新渲染的 Hook。

它属于逃生舱工具：只有在你确实需要让 UI 反映某些非 state 的变化，但又暂时无法改造成正确的数据流时，才建议使用。

## 何时使用

### 设计思路

React 推荐用 state 和 props 驱动渲染。但某些场景里，你可能拿到的是一个可变对象或外部系统回调（例如 ref、第三方实例、临时的外部 store），它们变化不会触发渲染：

- 你把数据放在 ref 里（ref.current 变化不会触发 render）
- 你在对接一个外部可变对象，但没有订阅机制或改造成本太高
- 你需要临时做桥接，后续会迁移到更规范的方案（例如 useSyncExternalStore）

此时 useForceUpdate 能作为最小成本方案：当你认为“现在应该刷新 UI”时，手动触发一次 render。

### 不建议使用的情况

- 只是为了偷懒：该用 state 的地方用 forceUpdate，会让数据流变得难以维护
- 可以用 cleanup 或订阅机制解决：优先正确建模，而不是强刷
- 依赖频繁变化：强刷会带来性能问题

## 代码演示

<code src="./demo/basic.tsx"></code>

## API

```typescript
const forceUpdate = useForceUpdate();

forceUpdate();
```

### Result

| 参数        | 说明                     | 类型         |
| ----------- | ------------------------ | ------------ |
| forceUpdate | 强制触发一次组件重新渲染 | `() => void` |

## FAQ

### 1）有什么更推荐的替代方案？

- 能用 state 就用 state
- 对接外部 store 建议使用 useSyncExternalStore（或自行实现订阅 + setState）
- 对副作用可取消的场景优先用 cleanup（useEffect return / useUnmount）
