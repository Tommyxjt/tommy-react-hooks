---
nav:
  path: /hooks
---

# usePrevious

用于获取某个值的“上一次渲染时的值”。常用于对比前后变化（例如判断 props/state 是否发生变化、实现“从 A 变到 B”这种边沿逻辑）。

---

## 使用场景

### 设计思路

- 使用 `useRef` 保存上一值，保证引用稳定且不会触发额外渲染。
- 通过 `useEffect` 在渲染提交后更新 ref：因此在当前渲染周期内读取到的就是“上一轮渲染的值”。
- 可选提供 `shouldUpdate` 来控制“哪些变化才算有效”，只在满足条件时才更新上一值（例如跳过某些中间态、忽略相同值、只记录满足校验的值）。

### 使用场景

- 对比当前值与上一值：实现差异化逻辑（如从 `loading=false` -> `true` 时触发一次行为）。
- 记录上一次的 props/state：用于动画过渡、埋点、性能优化（避免重复执行）。
- 只记录“有效值”：例如输入框只在通过校验时更新上一值，或只记录非空值。

---

## 代码演示

<code src="./demo/basic.tsx"></code>

---

## API

```typescript
const prev = usePrevious(value);

const prev2 = usePrevious(value, {
  initialValue: undefined,
  shouldUpdate: (prev, next) => prev !== next,
});
```

### Params

| 参数    | 说明                 | 类型                    | 默认值 |
| ------- | -------------------- | ----------------------- | ------ |
| value   | 需要追踪上一值的变量 | `T`                     | -      |
| options | 可选配置             | `UsePreviousOptions<T>` | `{}`   |

#### UsePreviousOptions

| 参数         | 说明                         | 类型                                         | 默认值 |
| ------------ | ---------------------------- | -------------------------------------------- | ------ |
| initialValue | 首次渲染时返回的“上一值”     | `T`                                          | -      |
| shouldUpdate | 控制何时写入下一次的“上一值” | `(prev: T \| undefined, next: T) => boolean` | -      |

### Result

| 参数 | 说明                 | 类型             |
| ---- | -------------------- | ---------------- |
| -    | 上一次渲染时的 value | `T \| undefined` |
