---
nav:
  path: /hooks
---

# useRafLoop

`useRafLoop` 用于创建一个**连续帧循环**：每一帧执行一次回调，并提供：

- `delta`：距离上一帧的时间差（ms）
- `time`：当前帧时间（ms，基于内部 driver.now）

它的定位是“**持续动画 / 仿真 / 绘制循环**”，例如 Canvas / WebGL / 物理推进 / 插值动画等。

## 代码演示

<code src="../demo/useRafLoop/basic.tsx"></code>

<code src="../demo/useRafLoop/compare-native.tsx"></code>

## API

```ts
export type UseRafLoopCallback = (delta: number, time: number) => void;

export interface UseRafLoopOptions {
  autoStart?: boolean;
}

export interface UseRafLoopActions {
  start(): void;
  stop(): void;
  toggle(): void;

  readonly running: boolean;
  isRunning(): boolean;
}

export default function useRafLoop(
  callback: UseRafLoopCallback,
  options?: UseRafLoopOptions,
): UseRafLoopActions;
```

### Params

| 参数              | 说明                                 | 类型                                    | 默认值 |
| ----------------- | ------------------------------------ | --------------------------------------- | ------ |
| callback          | 每帧执行一次，入参为 `(delta, time)` | `(delta: number, time: number) => void` | -      |
| options.autoStart | 是否自动启动（仅首次生效）           | `boolean`                               | `true` |

### Result

| 字段      | 说明                                           |
| --------- | ---------------------------------------------- |
| start     | 启动循环（幂等：重复 start 不会叠加多个 loop） |
| stop      | 停止循环（会撤销下一帧）                       |
| toggle    | 切换运行状态                                   |
| running   | 渲染用：是否正在运行                           |
| isRunning | 函数式读取：避免闭包误用                       |

## 注意事项

- `delta` 的首次值为 `0`（第一次执行没有上一帧可对比）。
- 回调里做“重计算/阻塞式逻辑”会造成卡顿（这是 rAF 的特性）。对照 demo 展示了“原生 rAF 常见误用：重复 start 叠加多个 loop”会导致更明显的卡顿。
