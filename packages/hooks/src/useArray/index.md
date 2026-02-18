---
nav:
  path: /hooks
---

# useArray

在 React 中以接近原生 `Array` 的调用方式管理数组状态，并确保写操作（包括 `arr[0] = x`、`arr.length = 0`）能可靠触发更新。

`useArray` 支持两种模式：

- **immutable（默认）**：每次真实变更都会产生新引用，适合 `deps/memo` 等“引用比较”语义。
- **mutable**：原地修改数组，通过内部强制刷新触发更新；适合“大数据 + 高频写入”场景，并额外提供 `getVersion()` 用于表达“内容变化”。

---

## 设计

### 设计目标

1. **像原生 Array 一样用**
   - 读：`map/filter/slice/find/forEach/...`
   - 写：`push/pop/shift/unshift/splice/sort/reverse/fill/copyWithin`
   - 直接写：`arr[index] = value`、`arr.length = n`、`delete arr[index]`
2. **写操作必须触发 React 更新**
3. **保证顺序语义（同一 tick 连续调用）**
4. **deps/memo 语义清晰**
   - immutable：引用变化即变化
   - mutable：引用稳定，用 `getVersion()` 表达变化
5. **不污染全局**
   - 不修改 `Array.prototype`

---

### 直接写 index / length（与原生语义对齐）

- `arr[index] = value`：写入指定位置
- `delete arr[index]`：删除该位置，形成 **hole（空槽）**
- `arr.length = 0`：清空数组
- `arr.length = smaller`：截断尾部
- `arr.length = larger`：扩容，新增部分为 **holes**（不是填充 `undefined`）

---

### immutable 模式：引用变化 + 顺序语义

immutable 的写操作遵循：

- 基于旧值创建 `next`（例如 `cur.slice()`），在 `next` 上执行变更
- commit(next) 时先同步维护 `latestRef.current`，再 `setState(next)`
- 同一事件里连续多次写操作会基于最新结果继续计算，顺序语义稳定

同时，immutable 会在数组引用变化时返回新的 Proxy 引用，便于把 `arr` 直接用于 `deps/memo`。

---

### mutable 模式：原地修改 + 版本号表达变化

mutable 模式把真实数组放在 `ref` 中，写操作直接原地修改：

- 真实变化时 `version++`
- 再通过内部强制刷新触发 rerender
- 暴露 `getVersion()`：用于 deps/memo 场景表达“内容变化”

---

## 代码演示

<code src="./demo/immutable.tsx"></code>

<code src="./demo/mutable.tsx"></code>

---

## API

### Hook 签名

```typescript
// 默认：immutable
const arr = useArray<T>(initial?);

// mutable：高频写入/大数据
const arr = useArray<T>(initial?, { mode: 'mutable' });
```

### Params

| 参数    | 说明                                       | 类型                                               | 默认值                  |
| ------- | ------------------------------------------ | -------------------------------------------------- | ----------------------- |
| initial | 初始值（支持数组 / Iterable / 惰性初始化） | `T[] \| Iterable<T> \| (() => T[] \| Iterable<T>)` | -                       |
| options | 配置                                       | `{ mode?: 'immutable' \| 'mutable' }`              | `{ mode: 'immutable' }` |

---

### Result（通用）

返回一个 Array-like 对象（调用方式接近原生 Array），并额外提供：

| 方法                      | 说明                      | 类型                                              |
| ------------------------- | ------------------------- | ------------------------------------------------- |
| `replace(next)`           | 整体替换                  | `(next: T[] \| Iterable<T>) => ArrayLike<T>`      |
| `reset()`                 | 重置到初始快照            | `() => ArrayLike<T>`                              |
| `clear()`                 | 清空（等价 `length = 0`） | `() => void`                                      |
| `insert(index, ...items)` | 插入（语义化 splice）     | `(index: number, ...items: T[]) => ArrayLike<T>`  |
| `removeAt(index, count?)` | 删除并返回被删除元素      | `(index: number, count?: number) => T[]`          |
| `move(from, to)`          | 迁移元素位置              | `(from: number, to: number) => ArrayLike<T>`      |
| `swap(i, j)`              | 交换两个位置              | `(i: number, j: number) => ArrayLike<T>`          |
| `batch(mutator)`          | 批处理一次更新            | `(mutator: (draft: T[]) => void) => ArrayLike<T>` |
| `toArray()`               | 返回 plain 数组快照       | `() => T[]`                                       |

---

### Result（仅 mutable 额外提供）

| 方法           | 说明                                    | 类型           |
| -------------- | --------------------------------------- | -------------- |
| `getVersion()` | 内容真实变化时递增；用于 deps/memo 语义 | `() => number` |

---

## 兼容性说明

`useArray` 的目标是“在 React 里像用原生数组一样读写，并能触发更新”。因此它对 **常见用法**（读写下标、读写 `length`、`delete` 产生 holes、`push/splice` 等、展开/迭代、`Array.isArray` 等）做了重点对齐。

但为了保持实现可控、避免引入过多底层陷阱，目前对少数 **偏反射/偏底层对象操作** 的能力不会强行完全模拟原生数组行为（后续会预留扩展口子）：

- `Object.defineProperty / Reflect.defineProperty` 直接定义下标或 `length` 的行为，可能与原生数组不完全一致。
- 通过 `Array.prototype.xxx.call/apply(proxy, ...)` 绕过实例方法的写法，可能无法保证与 `proxy.xxx(...)` 完全一致。
- `Object.freeze / seal / preventExtensions` 这类对象级别的不可变约束，不作为当前版本的兼容目标。
- 少数依赖 `constructor` 等元信息做判断的代码路径，可能与原生数组存在差异。

### 建议用法

- 变更数据优先使用：`arr.push(...) / arr.splice(...) / arr[i] = x / arr.length = n / delete arr[i]` 或文档中提供的扩展方法（如 `replace/reset/batch/toArray`）。
- 需要把数据交给第三方库（尤其是做深比较/序列化/不可变处理的库）时，优先传 `arr.toArray()` 的 plain 快照，避免库内部走到底层反射 API 导致语义差异。

---

## FAQ

### 1）为什么 mutable 模式要用 version，而不是把 arr 直接放进 deps？

mutable 模式下数组引用通常不变，因此需要用 `getVersion()` 的数值结果表达“内容变化”。

```typescript
const arr = useArray(initial, { mode: 'mutable' });
const version = arr.getVersion();

useEffect(() => {
  // 内容变化时触发
}, [version]);
```

注意不要写成：

```typescript
useEffect(() => {}, [arr.getVersion]); // ❌ 这是函数引用，通常稳定
```
