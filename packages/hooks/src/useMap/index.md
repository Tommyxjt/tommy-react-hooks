---
nav:
  path: /hooks
---

# useMap

在 React 中以接近原生 `Map` 的调用方式管理键值对状态，并确保 `set/delete/clear` 等写操作能可靠触发更新。

`useMap` 支持两种模式：

- **immutable（默认）**：每次真实变更都会产生新的引用，适合 `deps/memo` 等“引用比较”语义。
- **mutable**：原地修改 `Map`，通过内部强制刷新触发更新，适合“大数据 + 高频写入”场景；并额外提供 `getVersion()` 用于表达“内容变化”。

---

## 设计

### 设计目标

1. **像原生 Map 一样用**
   - 读：`get/has/size/entries/keys/values/[Symbol.iterator]`
   - 写：`set/delete/clear`
   - 扩展写：`batchSet/replace/reset`
2. **写操作必须触发 React 更新**
   - 避免“原地 mutate 但引用不变，UI 不更新”的常见坑
3. **尽量减少误用成本**
   - 不修改 `Map.prototype`（不污染全局）
   - 不要求 actions 重命名（多实例也不需要 `actions1/actions2`）
4. **保证顺序语义（同一 tick 连续调用）**
   - `map.set('a', 1); map.delete('a');` 这类连招应按书写顺序生效
5. **让 deps/memo 语义清晰**
   - immutable：引用变化即变化
   - mutable：引用稳定，但用 `getVersion()` 表达内容变化

---

### 核心实现策略：Proxy 封装（不改原型链）

`useMap` 返回的不是直接暴露的“原生 Map state”，而是一个 **Map-like 的 Proxy**：

- **读操作**：转发到内部的真实 `Map`
- **写操作**：拦截并改写为“变更检测 → 触发更新”

这样既能保留原生调用方式，又能把 React 更新逻辑内聚在 hook 内部。

---

### immutable 模式：引用变化 + 顺序语义

immutable 模式的关键是两点：

1. **每次真实变更都创建新 Map**

   - 典型写法：`next = new Map(cur)` → 修改 next → `setState(next)`
   - 好处：引用变化非常适合 `useEffect/useMemo/React.memo` 的比较语义

2. **同步维护 latestRef，保证同一 tick 连续调用顺序正确**
   - React 的 `setState` 是“排队更新”，同一事件里连续调用多个写操作时，不能依赖“当前 render 的快照值”做判断
   - 因此内部维护一个 `latestRef.current`，它代表“最新 + 已排队更新后的结果”
   - 每次 commit(next) 时先做：
     - `latestRef.current = next`
     - 再 `setMapState(next)`
   - 这样第二个操作会基于最新结果继续计算，而不会因为 state 尚未刷新而失效

另外，immutable 模式为了让 deps/memo 更自然，会在 `mapState` 引用变化时返回新的 Proxy 引用（从而 `deps` 可以直接依赖 `map` 变量）。

---

### mutable 模式：原地修改 + 版本号表达变化

mutable 模式的目标是降低“大 Map 高频写入”的拷贝成本：

- 内部真实 Map 放在 `ref`：`mapRef.current`
- 写操作直接对 `mapRef.current` 原地 `set/delete/clear`
- 变更后通过 `useForceUpdate()` 触发 rerender
- 同时维护一个 `versionRef.current++`
- 暴露 `getVersion()`（只在 mutable 存在），用于 deps/memo 语义：内容变化由版本号表达，而不是靠引用变化表达

---

## 代码演示

<code src="./demo/immutable.tsx"></code>

<code src="./demo/mutable.tsx"></code>

---

## API

### Hook 签名

```typescript
// 默认：immutable
const map = useMap<K, V>(initial?);

// mutable：高频写入/大数据
const map = useMap<K, V>(initial?, { mode: 'mutable' });
```

### Params

| 参数    | 说明                                      | 类型                                                                                       | 默认值                  |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------- |
| initial | 初始值（支持 Map / entries / 惰性初始化） | `Map<K, V> \| Iterable<readonly [K, V]> \| (() => Map<K, V> \| Iterable<readonly [K, V]>)` | -                       |
| options | 配置                                      | `{ mode?: 'immutable' \| 'mutable' }`                                                      | `{ mode: 'immutable' }` |

---

### Result（通用）

返回一个 Map-like 对象（调用方式接近原生 Map）。两种模式共享以下能力：

| 方法/属性               | 说明                                               | 类型                                                              |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `size`                  | 条目数                                             | `number`                                                          |
| `get(key)`              | 获取值                                             | `(key: K) => V \| undefined`                                      |
| `has(key)`              | 是否存在                                           | `(key: K) => boolean`                                             |
| `set(key, value)`       | 设置键值（支持链式调用）                           | `(key: K, value: V) => MapLike<K, V>`                             |
| `compute(key, updater)` | 基于旧值计算并写回；不存在时 `prev` 为 `undefined` | `(key: K, updater: (prev: V \| undefined) => V) => V`             |
| `delete(key)`           | 删除键                                             | `(key: K) => boolean`                                             |
| `clear()`               | 清空                                               | `() => void`                                                      |
| `batchSet(entries)`     | 批量增量写入（patch/merge 语义）                   | `(entries: Iterable<readonly [K, V]>) => MapLike<K, V>`           |
| `replace(next)`         | 整体替换（replace 语义）                           | `(next: Map<K, V> \| Iterable<readonly [K, V]>) => MapLike<K, V>` |
| `reset()`               | 重置到初始快照                                     | `() => MapLike<K, V>`                                             |

---

### Result（仅 mutable 额外提供）

| 方法           | 说明                                    | 类型           |
| -------------- | --------------------------------------- | -------------- |
| `getVersion()` | 内容真实变化时递增；用于 deps/memo 语义 | `() => number` |

---

## FAQ

### 1）为什么分 immutable 和 mutable？为什么不只保留一个模式？

两种模式分别优化不同目标，只保留一个会在另一类场景明显吃亏：

- **只保留 immutable**

  - 优点：引用变化表达变化，deps/memo 语义最直觉
  - 缺点：大 Map 高频写入时会频繁 `new Map(prev)`，拷贝成本更高

- **只保留 mutable**
  - 优点：原地修改更省拷贝，适合大数据批量写入
  - 缺点：引用通常不变，`useEffect/useMemo/React.memo` 等依赖引用比较的场景需要额外信号表达“内容变化”

因此默认提供更通用、更贴近 React 心智的 **immutable**，并提供性能取向的 **mutable** 作为可选项。

---

### 2）mutable 模式下，如何用于 deps/memo 场景来表达“内容变化”？

mutable 模式下 Map 引用通常不变，因此需要用 `getVersion()` 的数值结果表达“内容变化”。

推荐写法：

```typescript
const map = useMap(initial, { mode: 'mutable' });
const version = map.getVersion();

// useEffect：内容变化时触发
useEffect(() => {
  // 读取最新内容
}, [version]);

// useMemo：内容变化时重新计算派生数据
const list = useMemo(() => Array.from(map.entries()), [version]);

// memo 子组件：把 version 当作更新信号一起传下去
<MemoChild map={map} version={version} />;
```

注意不要写成：

```typescript
useEffect(() => {}, [map.getVersion]); // ❌ 这是函数引用，通常稳定，不会因内容变化触发
```

---

### 3）关于 immutable 实现：为什么看起来“不只是 new Map() 那么简单”？

我们内部确实是通过 `new Map(cur)` 产生新引用来实现 immutable，但为了满足“像原生 Map 一样用”的体验，还额外需要处理两件事：

1. **不能直接 mutate state 再拷贝**

   - `mapState.set(k, v); setMapState(new Map(mapState));` 这种写法会先原地修改 state 对象
   - 这会让旧引用的观察者（旧闭包、旧渲染路径）出现“状态突然变了”的风险
   - 所以 immutable 写操作必须是：基于旧值拷贝 next，再修改 next

2. **要保证同一 tick 连续调用按顺序生效**
   - React 的 state 更新是排队的，第一步 `set` 后，第二步 `delete/clear` 不能依赖“render 快照的 mapState”来判断，否则会出现：
     - `set('a',1)` 后马上 `delete('a')` 被误判为“不存在”而跳过
   - 因此 immutable 内部同步维护 `latestRef.current`：
     - 每次 commit(next) 先更新 `latestRef.current = next`
     - 再 `setMapState(next)`
   - 这样后续操作会基于最新结果继续计算，顺序语义稳定

另外，immutable 模式会在 `mapState` 引用变化时返回新的 Proxy 引用，以便你可以自然地把 `map` 用作 `deps` 或 `memo` props 比较（引用变化即变化）。
