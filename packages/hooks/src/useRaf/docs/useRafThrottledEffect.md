---
nav:
  path: /hooks
---

# useRafThrottledEffect

将「副作用执行」对齐到帧边界：同一帧内多次触发只执行一次（takeLatest），并可选 `maxFps` 主动跳帧限速。

它的最佳实践非常明确：**高频事件（scroll / resize / pointermove）里做“读布局 + 写 DOM”的副作用**。

- 事件回调里只做两件事：
  1. 记录最新输入（写 ref）
  2. `run()`（请求下一帧执行一次）
- 真正的重活（读布局、写 DOM）放在 effect 中：每帧最多一次

---

## 适用场景（Best Practice）

- `scroll / resize / pointermove` 驱动的 UI 效果，且 effect 内会：
  - 读布局：`getBoundingClientRect / offsetTop / scrollTop` 等
  - 写 DOM：`style.transform / CSS 变量 / classList` 等

这类场景如果每个事件都跑一次副作用，很容易出现 layout thrash、掉帧、卡顿。将副作用对齐到 rAF 通道通常是业界共识。

---

## 代码演示

<code src="../demo/useRafThrottledEffect/compare-native.tsx"></code>

---

## API

### Params

| 参数            | 说明                                               | 类型                         |
| --------------- | -------------------------------------------------- | ---------------------------- |
| effect          | 每次真正执行时运行的副作用函数；可返回 cleanup     | `() => void \| (() => void)` |
| deps            | 依赖数组；变化时会触发一次调度（最终按帧合并执行） | `React.DependencyList`       |
| options.maxFps  | 单实例限速（fps）；不传则跟随 rAF                  | `number \| undefined`        |
| options.enabled | 是否启用（默认 true）                              | `boolean \| undefined`       |

### Result

| 参数    | 说明                                                 | 类型         |
| ------- | ---------------------------------------------------- | ------------ |
| run     | 请求下一帧执行一次（同帧多次 run 会合并 takeLatest） | `() => void` |
| flush   | 若存在 pending：立刻同步执行一次                     | `() => void` |
| cancel  | 取消尚未执行的那一帧任务                             | `() => void` |
| pending | 是否有尚未执行的帧任务（渲染用）                     | `boolean`    |

---

## 注意事项

- `useRafThrottledEffect` 不是“万能节流”。当你的输入频率本来就不高（≤ rAF fps 或 ≤ maxFps）时，收益可能不明显。
- 显示器刷新率会影响 rAF fps（例如 120Hz 屏 cap 更高），因此同样的输入频率更不容易“合并出差异”。
- cleanup 语义：为了避免“中间空窗期”，本 hook 采用“下一次真正执行前 cleanup”的策略（而不是 deps 变了立刻 cleanup 再等下一帧）。

---

## FAQ

### 为什么不用普通 useEffect？

普通 `useEffect` 只会在 render 后触发；但高频事件通常发生在事件回调中（scroll/pointermove），如果你把重活直接放在事件回调里，会非常频繁。此 hook 的核心是：**事件回调只触发调度，重活对齐到帧边界执行**。

### 切到 120Hz 屏幕会影响效果吗？

会。rAF 的上限通常与屏幕刷新率相关：120Hz 更接近每秒 120 次回调（≈8.33ms 一帧）。当输入频率不高于 cap 时，合并空间自然变小。
