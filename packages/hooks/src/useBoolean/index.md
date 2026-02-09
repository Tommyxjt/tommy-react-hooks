---
nav:
  path: /hooks
---

# useBoolean

用于在两个布尔值间切换的 Hook。

---

## 代码演示

<code src="./demo/basic.tsx"></code>

---

## API

```typescript
const [state, { toggle, setTrue, setFalse }] = useBoolean(initialValue: boolean);
```

### Params

| 参数         | 说明                     | 类型      | 默认值 |
| ------------ | ------------------------ | --------- | ------ |
| initialValue | 必填项，传入默认的状态值 | `boolean` | -      |

### Result

| 参数    | 说明     | 类型             |
| ------- | -------- | ---------------- |
| state   | 状态值   | `boolean`        |
| actions | 操作集合 | `BooleanActions` |

### BooleanActions

| 参数     | 说明         | 类型         |
| -------- | ------------ | ------------ |
| toggle   | 切换 state   | `() => void` |
| setTrue  | 设置为 True  | `() => void` |
| setFalse | 设置为 False | `() => void` |
