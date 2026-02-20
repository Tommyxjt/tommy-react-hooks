---
nav:
  path: /hooks
---

# useEventBus

`useEventBus` 是 `EventBus` 在 React 场景下的**接入入口**。

当前版本它刻意保持很薄，主要做三件事：

- 接收上层传入的 `bus` 实例并返回
- 参数校验（未传入时直接报错）
- 开发期提示（例如：`bus` 引用在组件生命周期中发生变化）

它的价值不在于“封装很多逻辑”，而在于先把 **React 侧统一入口** 定下来，为后续扩展预留稳定 API 位置。

---

## 设计

### 当前定位（薄入口）

`useEventBus` 当前的定位是：

1. **React 侧接线入口**
   - 上层先用 `createEventBus()` 创建实例
   - 组件内通过 `useEventBus(bus)` 接入
2. **参数与用法保护**
   - 避免遗漏 `bus` 导致静默失败
3. **开发期诊断**
   - 提醒常见误用（例如在 render 中反复创建 bus）

也就是说，当前版本可以把它理解为：

- React 语义下的 **assert + return**

---

### 为什么要单独保留 `useEventBus`

虽然当前版本很薄，但它是一个非常有价值的“口子”，因为它占住了：

#### 1）React 官方入口位

以后 React 侧统一通过 `useEventBus(...)` 获取 bus，而不是在业务代码里到处直接用实例。

这样后续升级时（例如引入 Context/Provider），业务调用心智不需要推翻。

#### 2）职责边界位

当前分层会更清晰：

- `eventBusCore`：纯事件机制
- `createEventBus`：工厂与对外体验
- `useEventBus`：React 接入入口
- （未来）`useEventBusListener`：订阅封装

#### 3）未来扩展位

这个入口后续可以自然承接更多 React 侧能力，而不需要改核心机制。

---

### 未来计划（这个“口子”是为哪些能力准备的）

`useEventBus` 后续主要为这些方向预留：

#### 1）Context / Provider 方案

当前是传参版：

···typescript
const bus = useEventBus(busInstance);
···

后续可以扩展为 Context 版（或专用域 hook）：

- `useEventBus()`（单 Context）
- `useXXXBus()`（多 bus 并存时的专用 hook）

#### 2）作用域级共享

未来可支持“局部子树共享同一个 bus”，而不是只能靠 props 一层层传递。

#### 3）更强的开发期诊断

例如：

- Provider 缺失提示
- 上下文错位提示
- 引用抖动提示（已具备基础版）

#### 4）与事件订阅 hooks 的协作

未来 `useEventBusListener` / `useEventListener` 系列可以统一约定从 `useEventBus` 获取实例，减少 API 分裂。

---

### 生命周期与引用稳定性（重要）

`useEventBus` **不负责创建实例，也不负责实例稳定性**。

它的使用前提是：上层已经准备好了一个 `bus`，并且（在 React 中）由“拥有者”确保该实例稳定。

推荐在上层使用 `useRef` 或 `useMemo` 创建一次并复用。

---

## 代码演示

<code src="../demo/useEventBus/basic.tsx"></code>

---

## API

### Hook 签名

···typescript
const bus = useEventBus(busInstance);
···

### Params

| 参数  | 说明                                                  | 类型          |
| ----- | ----------------------------------------------------- | ------------- |
| `bus` | 已创建好的 EventBus 实例（通常来自 `createEventBus`） | `EventBus<E>` |

---

### Result

返回传入的同一个 `bus` 实例（在 React 侧完成校验与开发期保护后返回）。

| 返回值 | 说明                                                           | 类型          |
| ------ | -------------------------------------------------------------- | ------------- |
| `bus`  | EventBus 实例（可调用 `on/once/off/emit/clear/listenerCount`） | `EventBus<E>` |

---

## FAQ

### 1）`useEventBus` 看起来几乎没做什么，为什么还要有它？

这是有意为之。当前版本它主要承担的是 **React 入口边界**，而不是业务能力本身。

它的价值在于：

- 统一 React 接入方式
- 放参数校验和开发期提示
- 为后续 Context/Provider、专用域 hook、订阅类 hooks 预留稳定入口

换句话说，它现在“薄”，但不是多余；它是在提前铺 API 轨道。

---

### 2）为什么不在 `useEventBus` 里直接创建 bus？

创建实例是 `createEventBus` 的职责；`useEventBus` 的职责是“接入”。

如果在 `useEventBus` 里偷偷创建实例，会让职责混乱，也会让多实例/作用域实例的语义变得不清晰。

---

### 3）`useEventBus` 会自动帮我订阅事件吗？

不会。当前版本 `useEventBus` 只负责获取 bus。

订阅事件建议在组件里显式用 `useEffect` + `bus.on(...)`，后续如果需要更高层封装，再单独提供 `useEventBusListener` 一类的 hook。
