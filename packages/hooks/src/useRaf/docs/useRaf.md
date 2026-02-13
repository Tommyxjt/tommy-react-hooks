---
nav:
  path: /hooks
---

# useRaf

`useRaf` 是一个轻量的“按帧合并执行器”。

- **同一帧内多次调用**会被合并为**下一帧只执行一次**
- 默认策略是 **takeLatest**：只使用“最后一次调用”的参数
- 可选 `maxFps`：对**单实例**做进一步限速（仍保持 takeLatest）

适合用来处理高频输入（scroll / drag / pointermove / 订阅推送等），将它们折叠为“按帧”的一次性提交，从而减少重复计算与无意义的重复更新。

## 何时使用

useRaf 适合用在高频触发的场景：把同一帧内的多次触发合并为下一帧只执行一次，并且默认只取“最后一次参数”（takeLatest）。

- **同帧合并（takeLatest）**：避免“每次事件都调度一次 rAF 回调”，减少重复调度与重复计算
- **更简单的取消语义**：不需要自己管理 requestId，使用 raf.cancel() 一键撤销当前挂起的那一帧
- **自动卸载清理**：组件卸载时会自动清理挂起任务，避免卸载后仍执行回调带来的警告或多余工作
- **兼容无 rAF 环境**：在不支持 requestAnimationFrame 的运行环境会自动降级为 setTimeout 近似模拟“下一帧”（仅用于对齐语义，不保证 60fps）

## 代码演示

<code src="../demo/useRaf/basic.tsx"></code>

<code src="../demo/useRaf/advanced.tsx"></code>

## API

```ts
export interface UseRafOptions {
  maxFps?: number;
}

export type UseRafReturn<Args extends any[]> = ((...args: Args) => void) & {
  flush: () => void;
  cancel: () => void;
  dispose: () => void;
  readonly pending: boolean;
  isPending: () => boolean;
};

export default function useRaf<Args extends any[]>(
  invoke: (...args: Args) => void,
  options?: UseRafOptions,
): UseRafReturn<Args>;
```

### Params

| 参数           | 说明                               | 类型                      | 默认值 |
| -------------- | ---------------------------------- | ------------------------- | ------ |
| invoke         | 下一帧真正执行的回调（takeLatest） | `(...args: Args) => void` | -      |
| options.maxFps | 单实例限速（可选）                 | `number`                  | -      |

### Result

返回一个“可调用函数”，并附带控制方法：

- `raf(...args)`：请求下一帧执行一次（同帧内 takeLatest 合并）
- `raf.flush()`：若存在 pending，则立刻同步执行一次并清空 pending
- `raf.cancel()`：撤销尚未执行的那一帧并清空 pending
- `raf.dispose()`：语义化的 cancel（组件卸载会自动清理）
- `raf.pending`：是否存在尚未执行的帧任务（渲染用 getter）
- `raf.isPending()`：函数式读取 pending（避免闭包误用）
