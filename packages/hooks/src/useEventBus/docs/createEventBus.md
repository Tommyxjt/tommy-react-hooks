---
nav:
  path: /hooks
---

# createEventBus

`createEventBus` 用于创建一个 **独立的 EventBus 实例**。它是对底层 `eventBusCore` 的对外工厂封装：

- `eventBusCore` 负责纯机制（listeners 存储、`on/off/once/emit/clear`）
- `createEventBus` 负责对外体验（默认值、开发期告警、调试名等）

> `createEventBus` 是普通工厂，不依赖 React；因此可用于 React 组件外（模块、service、工具层、测试）或 React 内（通过 `useRef/useMemo` 稳定实例）。

---

## 设计

### 设计目标

1. **多实例优先，默认隔离**
   - 每次调用 `createEventBus()` 都返回一个全新的 bus 实例
   - 不同实例之间默认不互通（A `emit` 不会触发 B 的监听器）
2. **保持核心机制纯净**
   - 纯机制留在 `eventBusCore`
   - 对外体验（告警、调试增强）留在 `createEventBus`
3. **派发语义可预测**
   - `emit` 默认同步执行
   - 派发时对监听器做快照遍历，避免遍历过程中 `on/off` 污染本轮行为
4. **错误隔离**
   - 单个 handler 抛错不会打断同事件下其他 handler
   - 错误统一交给 `onError`（用户自定义或默认打印）
5. **开发期可诊断**
   - 支持 `debugName`
   - 支持 `maxListeners` 告警，帮助定位重复订阅/泄漏

---

### 工厂层与核心层的职责边界

`createEventBus` 不重新实现事件机制，而是在 `eventBusCore` 外面包一层工厂：

- **核心层（eventBusCore）**
  - listeners 存储（`Map + Set`）
  - `on / once / off / emit / clear / listenerCount`
  - `once` 包装与自动移除
  - `emit` 快照遍历与错误隔离
- **工厂层（createEventBus）**
  - 合并 options 默认值
  - 组装默认 `onError`
  - 开发期告警（`maxListeners`）
  - 调试标识（`debugName`）

这样后续新增调试/诊断能力时，不需要污染核心实现。

---

### 多实例模型：为什么默认不做“单例”

`createEventBus()` 是工厂，不是单例入口。每次调用都创建新实例。

好处：

- **隔离性好**：不同业务域、不同测试用例互不影响
- **可测性好**：每个测试拿自己的实例
- **适配复杂场景**：多 React Root、微前端、作用域级共享都更自然

如果你想全局共享，只需要在模块级创建一次并导出该实例即可（“单例是用法，不是机制”）。

---

### 返回实例的行为约定（最终语义）

`createEventBus()` 返回的 bus 实例具备以下稳定语义：

#### 1）`on(eventName, cb)` 重复注册：忽略（no-op）

- 同一事件下，同一个函数引用只保留一份监听
- 不会重复注册，也不会重排执行顺序（与 `Set.add` 语义一致）

#### 2）`once(eventName, cb)` 重复注册：忽略（no-op）

- 与 `on` 保持一致
- 同一事件下，同一个函数引用只保留一个 once 监听
- 不会覆盖旧监听、不会重排顺序

#### 3）`off(eventName, cb)` 可同时取消 `on` 和 `once`

- 普通 `on` 监听：直接按函数引用移除
- `once` 监听：内部通过原函数到 wrapper 的映射，支持 `off(eventName, cb)` 直接取消

#### 4）`emit(eventName, payload)` 默认同步派发

- 当前调用栈内执行，不做异步调度/任务分片
- 使用监听器快照遍历，保证本轮派发稳定

---

### 同步派发 + 快照遍历（可预测时序）

`emit` 的核心策略：

1. 取出当前事件名的监听集合
2. 创建快照（数组）
3. 按快照顺序依次执行

这样可以避免下面这些边界问题：

- handler 内 `off` 自己或别人，导致遍历跳项/重复
- handler 内 `on` 新监听器，意外在本轮被执行
- `once` 自删影响当前遍历游标

最终语义是：**本轮 `emit` 只对“派发开始时已存在的监听器快照”负责**。

---

### 错误处理：`onError` 兜底，不打断其他监听器

`emit` 时每个 handler 都在独立 `try/catch` 中执行：

- 某个 handler 抛错
- 调用 `onError(error, meta)` 处理
- 然后继续执行同一事件的其他 handler

默认 `onError`（未传入时）会在可用环境下调用 `console.error` 打印错误信息。

这保证了：

- **错误可见**
- **事件系统不被单个监听器拖垮**

---

### 开发期告警：`maxListeners` 与 `debugName`

`createEventBus` 支持两个开发期诊断能力：

#### `maxListeners`

- 监听器数量超过阈值时发出告警（仅开发环境）
- 用于帮助定位：
  - effect 依赖写错导致重复订阅
  - cleanup 漏写导致监听器泄漏

#### `debugName`

- 用于日志前缀标识，方便定位是哪个 bus 抛错/超限
- 适合在大型项目中区分不同业务域的 bus

---

### 生命周期与引用稳定性（重要）

`createEventBus` **不负责引用稳定**。它是普通工厂，调用一次就创建一个新实例，这是预期行为。

在 React 中如果你希望“同一组件生命周期内 bus 稳定”，应该在上层创建者处处理，例如使用 `useRef` 或 `useMemo`：

- 工厂负责“创建”
- React 层负责“稳定”
- `useEventBus`（当前版本）负责“接入与校验”

这样职责边界最清晰，也不会破坏“多实例优先”的设计。

---

## 代码演示

<code src="../demo/createEventBus/basic.tsx"></code>

---

## API

### 工厂签名

```typescript
const bus = createEventBus<Events>(options?);
```

---

### Params

| 参数                   | 说明                                      | 类型                            | 默认值                         |
| ---------------------- | ----------------------------------------- | ------------------------------- | ------------------------------ |
| `options`              | 配置项                                    | `CreateEventBusOptions<Events>` | `{}`                           |
| `options.onError`      | 监听器抛错时的统一处理逻辑                | `(error, meta) => void`         | 内置 `console.error`（可用时） |
| `options.debugName`    | 调试名（用于日志定位）                    | `string`                        | -                              |
| `options.maxListeners` | 开发期监听器数量告警阈值；`<= 0` 表示关闭 | `number`                        | `50`                           |

---

### Result（返回的 EventBus 实例）

`createEventBus` 返回一个独立的 EventBus 实例，包含以下方法：

| 方法                        | 说明                                                       | 类型                                                                                |
| --------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `on(eventName, handler)`    | 注册监听；重复注册同一函数会忽略；返回 `unsubscribe`       | `<K extends keyof E>(eventName: K, handler: (payload: E[K]) => void) => () => void` |
| `once(eventName, handler)`  | 注册一次性监听；重复注册同一函数会忽略；返回 `unsubscribe` | `<K extends keyof E>(eventName: K, handler: (payload: E[K]) => void) => () => void` |
| `off(eventName, handler)`   | 取消监听；可同时取消 `on` 和 `once`                        | `<K extends keyof E>(eventName: K, handler: (payload: E[K]) => void) => void`       |
| `emit(eventName, payload)`  | 同步派发事件（快照遍历）                                   | `<K extends keyof E>(eventName: K, payload: E[K]) => void`                          |
| `clear(eventName?)`         | 清空某个事件或整个 bus                                     | `<K extends keyof E>(eventName?: K) => void`                                        |
| `listenerCount(eventName?)` | 获取某个事件或整个 bus 的监听器数量                        | `<K extends keyof E>(eventName?: K) => number`                                      |

---

### 使用建议（React 场景）

在 React 组件内创建 bus 时，建议由“拥有者”确保实例稳定：

```typescript
const busRef = useRef<ReturnType<typeof createEventBus<AppEvents>> | null>(null);

if (!busRef.current) {
  busRef.current = createEventBus<AppEvents>({ debugName: 'page-bus' });
}

const bus = busRef.current;
```

这样可以避免每次 rerender 重新创建新实例。

---

## FAQ

### 1）`createEventBus` 看起来很薄，为什么不直接用 `eventBusCore`？

`createEventBus` 的价值不是“重写机制”，而是**把核心机制层和对外体验层分开**。

如果用户直接用 `eventBusCore`，后续这些能力都只能往 core 里塞：

- `debugName`
- `maxListeners` 告警
- 调试日志
- 统计/trace/插件（未来）

这样 core 会越来越脏。保留 `createEventBus` 能让核心实现长期保持纯净稳定。

---

### 2）为什么 `createEventBus` 不负责“引用稳定”？React rerender 不就会新建实例吗？

这是职责边界问题：

- `createEventBus` 是普通工厂，只负责“创建新实例”
- React 中“同一组件生命周期只创建一次”的稳定性，应该由 `useRef/useMemo` 这种 React 机制负责

如果让 `createEventBus` 偷偷做缓存，会破坏“多实例优先”的设计，还会让 options 更新语义变得不清晰（到底复用还是重建）。

---

### 3）为什么有 `maxListeners` 这种开发期告警？是不是多余？

不多余，而且很实用。它主要用于发现“代码能跑但大概率写错”的情况，例如：

- `useEffect` 依赖写错，导致每次 render 都重复订阅
- 忘记在 cleanup 里取消订阅，监听器持续累积

这类问题在开发期不一定立即报错，但后续会表现为：

- 重复触发
- 性能变差
- 内存增长

开发期告警能提前把问题暴露出来。

---

### 4）为什么 `emit` 不做任务分片（例如 microtask / setTimeout / idle）？

`createEventBus` 和底层 `eventBusCore` 的目标是提供**可预测的同步事件机制**。如果在内部做任务分片，会改变核心语义：

- 从同步变异步
- 事件顺序更复杂
- 单测和调试更难写

如果业务确实需要分片/调度，建议在外部使用方实现（例如在 handler 内自行调度），而不是放进核心事件机制里。

---

### 5）`once` 为什么还能被 `off(eventName, cb)` 取消？内部怎么做到的？

`once` 注册时，真正放进监听集合的是内部 wrapper，而不是原始 `cb`。为了让 `off(eventName, cb)` 也能取消 once，内部会维护“原始回调 → wrapper”的映射（按 `eventName` 分桶）。

这样 `off` 时就能：

1. 尝试删除普通 `on` 的 `cb`
2. 再根据映射找到 once 的 wrapper 并删除

这让 `on` 和 `once` 在取消行为上保持一致，减少使用心智负担。

---

### 6）为什么 `on` / `once` 的重复注册都采用“忽略（no-op）”而不是“重排/覆盖”？

为了保持语义一致和执行顺序稳定：

- `on` 底层用 `Set` 存储，同一函数重复 `add` 本来就是 no-op，不会重排
- `once` 也保持同样语义，避免“重复调用一次注册 API 导致执行顺序悄悄变化”的隐蔽问题

如果调用方确实想重排顺序，应显式写：

```typescript
bus.off(eventName, cb);
bus.on(eventName, cb);
// 或 bus.once(eventName, cb)
```

这样行为更明确，也更容易排查问题。

---

### 7）为什么文档里用 `eventName`，而不是 `type` / `key`？

`eventName` 的语义更直接，阅读时不容易和 TypeScript 的 `type` 关键字或普通字典 `key` 混淆。

在事件系统里，`eventName` 能更清楚地表达“这是事件名”，尤其在 `on/once/off/emit` 这类 API 中可读性更好。
