---
nav:
  path: /hooks
---

# useDebouncedState

用于管理带防抖能力的状态 Hook，常用于输入框、搜索词等场景，支持 `leading` 立即触发与 `skipInitial` 跳过初始值。

## 代码演示

<code src="./demo/basic.tsx"></code>

<code src="./demo/leading.tsx"></code>

<code src="./demo/skipInitial.tsx"></code>

## API

```ts
const [state, setState, debouncedState] = useDebouncedState<T>(
  initialValue: T,
  options?: DebounceOptions
);
```

### Params

| 参数         | 说明               | 类型              | 默认值 |
| ------------ | ------------------ | ----------------- | ------ |
| initialValue | 必填项，初始状态值 | `T`               | -      |
| options      | 防抖配置项         | `DebounceOptions` | -      |

### DebounceOptions

| 参数        | 说明                                                                  | 类型      | 默认值  |
| ----------- | --------------------------------------------------------------------- | --------- | ------- |
| delay       | 防抖延迟时间（ms）                                                    | `number`  | `500`   |
| leading     | 是否在变更时立即触发一次                                              | `boolean` | `false` |
| skipInitial | 是否跳过初始值对应的 debouncedState，跳过的话初始值为固定 `undefined` | `false`   | -       |

### Result

| 参数     | 说明              | 类型                          |
| -------- | ----------------- | ----------------------------- |
| state    | 当前实时状态      | `T`                           |
| setState | 更新 state 的方法 | `Dispatch<SetStateAction<T>>` |
| actions  | 防抖后的状态值    | `T \| undefined`              |

### 使用说明

**state**：始终立即更新，适合用于受控组件

**debouncedState**：在 delay 后更新，适合用于副作用（如请求）

**leading**: true 时：

> 在 useDebouncedState 中开启 leading 选项时，debouncedState 会在首次更新时立即同步。也就是说，用户第一次输入时，debouncedState 会立刻更新为当前的 state，而不是等待防抖延迟。此功能适用于那些需要在首次输入时立即反馈的场景，如搜索框中的即时提示。后续输入仍会遵循防抖延迟更新逻辑。

**skipInitial**: true 时：

> 在 useDebouncedState 中开启 skipInitial 选项时，debouncedState 初始值为 undefined。这意味着在组件初次渲染时，防抖状态不会立即更新，而是等到用户输入后才会更新。这样可以避免在首次渲染时触发不必要的副作用（例如请求）。该功能常用于避免首次渲染时因初始化值而导致的错误请求。
