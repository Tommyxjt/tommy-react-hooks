---
nav:
  path: /hooks
---

# useRafState

`useRafState` 用于把 state 更新合并到 **下一帧** 再提交（commit），从而保证 **渲染最多每帧一次**。

它最适合的场景是：你的状态更新来源可能远高于屏幕刷新率（例如订阅/轮询/消息流/高频回调），但 UI 没必要以 200Hz 甚至更高频率重渲染。

## 代码演示

<code src="../demo/useRafState/basic.tsx"></code>

<code src="../demo/useRafState/compare-native.tsx"></code>

## API

```ts
export interface UseRafStateOptions {
  maxFps?: number;
}

export interface UseRafStateActions<T> {
  flush(): void;
  cancel(): void;
  dispose(): void;

  readonly pending: boolean;
  isPending(): boolean;

  getPendingState(): T | undefined;
  getLatestState(): T;
}

export type UseRafStateReturn<T> = [
  T,
  React.Dispatch<React.SetStateAction<T>>,
  UseRafStateActions<T>,
];

export default function useRafState<T>(
  initialState: T | (() => T),
  options?: UseRafStateOptions,
): UseRafStateReturn<T>;
```

### Result

| 参数             | 说明                                    | 类型                          |
| ---------------- | --------------------------------------- | ----------------------------- |
| `state`          | 已提交（committed）的状态值             | `T`                           |
| `setState(next)` | 请求下一帧提交；支持 value 与函数式更新 | `Dispatch<SetStateAction<T>>` |
| `actions`        | 控制与读取接口（见下表）                | `UseRafStateActions<T>`       |

### actions

| 参数                | 说明                                                       | 类型                   |
| ------------------- | ---------------------------------------------------------- | ---------------------- |
| `flush()`           | 若存在 pending：立刻同步提交一次并清空 pending；否则 no-op | `() => void`           |
| `cancel()`          | 撤销尚未执行的那一帧提交，并清空 pending                   | `() => void`           |
| `dispose()`         | 语义化的 `cancel()`（供卸载清理）                          | `() => void`           |
| `pending`           | 是否存在尚未提交的帧任务（渲染用 getter）                  | `boolean`              |
| `isPending()`       | 函数式读取 pending（避免闭包误用）                         | `() => boolean`        |
| `getPendingState()` | 读取 pending 的“预测下一状态”（无 pending 则 `undefined`） | `() => T \| undefined` |
| `getLatestState()`  | 读取“最新状态”：优先 pending 预测值，否则 committed        | `() => T`              |

## 行为说明

- 同一帧内多次更新会合并到一次提交。
- 函数式更新不会丢：同一帧内多次 `setState((x) => x + 1)` 会按顺序组合，等价于累计。

## FAQ

### 1) 为什么有时候 `commits/s` 跟 naive 差不多，看起来 “useRafState 没用”？

`useRafState` 是“按帧合并（coalescing）”，不是强制节流器：

- 它只能把 **同一帧内** 的多次更新合并成一次提交
- 如果你的输入频率本来就没有超过帧率（例如 ticks/s ≤ rAF fps），那每条 tick 很可能都落在不同帧里，合并空间就很小

所以 `useRafState` 是否明显有效，取决于 `ticks/s` 相对 `cap` 的大小。

### 2) `cap` 是什么？它由什么决定？

`cap` 可以理解为 “useRafState 最多每秒能提交多少次” 的上限：

- 如果未设置 `maxFps`：`cap ≈ rAF fps`（受显示器刷新率/浏览器调度影响）
- 如果设置了 `maxFps`：`cap = maxFps`（主动跳帧限速）

当 `ticks/s ≫ cap` 时，合并收益通常才会明显。

### 3) 显示器刷新率（60/120/144Hz）会影响对照结果吗？

会。高刷新率显示器通常带来更高的 `rAF fps`：

- 60Hz → 一帧约 16.67ms，cap 更低，更容易出现“ticks/s ≫ cap”
- 120Hz → 一帧约 8.33ms，cap 更高，同样的 ticks/s 更不容易超出 cap

所以在 120/144Hz 环境里，想看到明显差异，往往需要更高的 ticks/s（更小的 intervalMs）或显式设置更低的 `maxFps`。

### 4) 什么时候用 `useRafState` 更合适？什么时候普通 `useState` 就够了？

更适合 `useRafState`：

- 高频数据源（订阅/行情/传感器/拖拽/指针移动）导致 `ticks/s` 明显高于 `cap`
- 渲染较重，频繁 commit 容易掉帧，希望把提交对齐到帧并合并
- 需要配合 `maxFps` 做“单实例限速”（例如 30fps 的 UI）
- 如果你的`ticks/s` 没有明显超过 `cap`：那 useRaf\* 更多是“更安全、跨环境一致、少心智负担”的封装（自动 GC + 无 raf 环境降级）。

普通 `useState` 往往就够：

- `ticks/s` 没有明显超过 `cap`（本来就“不超帧”）
- 渲染很轻、更新频率不高，额外的调度层反而可能带来复杂度/少量开销
