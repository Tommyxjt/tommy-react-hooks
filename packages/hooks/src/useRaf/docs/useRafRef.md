---
nav:
  path: /hooks
---

# useRafRef

`useRafRef` 用于把“高频写入”合并到 **下一帧** 再写入 `ref.current`（默认 takeLatest）：

- 同一帧内多次 `set(next)` 会合并，只保留最后一次（takeLatest）
- 写入发生在下一帧 tick（或 `flush()` 同步提交）
- **不会触发 React rerender**：适合把数据喂给 imperative 逻辑（loop/canvas/webgl/第三方实例）

## 最贴合的使用场景

把高频输入（pointermove/scroll/drag/订阅）写进一个“按帧更新的 ref”，让另一个 imperative 循环去读取并更新 DOM / Canvas：

- React 不需要为每次输入都 rerender
- loop 侧每帧读取到的是“最新且按帧稳定”的值

## 代码演示

<code src="../demo/useRafRef/basic.tsx"></code>

## API

```ts
export interface UseRafRefActions<T> {
  flush(): void;
  cancel(): void;
  dispose(): void;

  readonly pending: boolean;
  isPending(): boolean;

  getPendingValue(): T | undefined;
  getLatestValue(): T;
}

export type UseRafRefReturn<T> = [
  React.MutableRefObject<T>,
  (next: T) => void,
  UseRafRefActions<T>,
];

export default function useRafRef<T>(initialValue: T): UseRafRefReturn<T>;
```

### Result

| 参数        | 说明                                                                             | 类型                        |
| ----------- | -------------------------------------------------------------------------------- | --------------------------- |
| `ref`       | 已提交（committed）的值；只会在“下一帧 tick”（或 `flush()`）时写入 `ref.current` | `React.MutableRefObject<T>` |
| `set(next)` | 请求下一帧写入；同一帧内多次调用会 **takeLatest**（只保留最后一次）              | `(next: T) => void`         |
| `actions`   | 控制与读取接口（见下表）                                                         | `UseRafRefActions<T>`       |

### actions

| 参数                | 说明                                                       | 类型                   |
| ------------------- | ---------------------------------------------------------- | ---------------------- |
| `flush()`           | 若存在 pending：立刻同步提交一次并清空 pending；否则 no-op | `() => void`           |
| `cancel()`          | 撤销尚未执行的那一帧写入，并清空 pending                   | `() => void`           |
| `dispose()`         | 语义化的 `cancel()`（供卸载清理）                          | `() => void`           |
| `pending`           | 是否存在尚未提交的帧任务（渲染用 getter）                  | `boolean`              |
| `isPending()`       | 函数式读取 pending（避免闭包误用）                         | `() => boolean`        |
| `getPendingValue()` | 读取 pending 值（若无 pending 则为 `undefined`）           | `() => T \| undefined` |
| `getLatestValue()`  | 读取“最新值”（优先 pending，否则 `ref.current`）           | `() => T`              |

> 需要“累计/自定义合并（merge）”请使用 `useRafScheduler` 或 `useRafState`。

## FAQ

### Q：我已经在用 useRafLoop 了，为什么还需要 useRafRef？直接 useRef 不就行了吗？

多数情况下你说得对：**如果只是让 loop 每帧读一次“最新输入值”**，用 `useRef` 直接在事件里写 `ref.current = next` 就够了，`useRafRef` 并不是刚需。

`useRafRef` 的价值主要不在“能不能存最新值”，而在于它提供了 `useRef` 不具备的一些**按帧语义与可控能力**：

- **帧稳定采样（frame sampling / sample-and-hold）**  
  同一帧内多次写入会合并（takeLatest），并在下一帧统一提交。这样 loop 在同一帧内读到的是稳定快照，下一帧才会看到更新，避免“一帧内多次写入导致读到半帧状态/抖动”的情况。

  > 如果你的 loop 每帧只读一次，这个差异通常不明显；但当 loop 内分多个阶段读取输入（例如积分/碰撞/渲染分步）或对确定性更敏感时更有价值。

- **pending / flush / cancel 语义**  
  `useRef` 没有“待提交”的概念，也没有统一的“立刻提交/撤销待提交”的语义；`useRafRef` 提供：

  - `pending / isPending()`：是否存在尚未提交的帧更新
  - `flush()`：立刻把 pending 同步提交（例如鼠标松开、离开页面前强制落地）
  - `cancel()`：撤销 pending（例如按 Esc 取消交互、模式切换丢弃未生效输入）

- **语义一致性**  
  当项目里已经统一了“按帧合并 + takeLatest”的调度语义时，`useRafRef` 可以让“ref 写入”也遵循同一套语义，减少团队理解成本。

结论：

- **只要最新值，且不需要 flush/cancel/pending** → `useRef` 更简单
- **需要按帧采样稳定性或 flush/cancel/pending 语义** → `useRafRef` 更合适
