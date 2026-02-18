import { useMemo, useRef, useState } from 'react';
import { useLatestRef } from '../_internal/react/useLatestRef';
import { isArrayIndex, isSameArray, toArray, toLength, type ResolvedInit } from './utils';

export type ImmutableReactiveArray<T> = T[] & {
  replace: (next: T[] | Iterable<T>) => ImmutableReactiveArray<T>;
  reset: () => ImmutableReactiveArray<T>;
  clear: () => void;

  insert: (index: number, ...items: T[]) => ImmutableReactiveArray<T>;
  removeAt: (index: number, count?: number) => T[];

  move: (from: number, to: number) => ImmutableReactiveArray<T>;
  swap: (i: number, j: number) => ImmutableReactiveArray<T>;

  /**
   * 批处理：在 draft 上做多步修改，只触发一次更新
   */
  batch: (mutator: (draft: T[]) => void) => ImmutableReactiveArray<T>;

  /**
   * plain 快照：避免把 proxy 传给第三方
   */
  toArray: () => T[];
};

/**
 * 统一索引归一化：支持负数索引（从尾部倒数）
 * - 非法值（NaN/Infinity）按 0 处理
 * - 负数：length + i（最小到 0）
 * - 正数：最大到 length
 */
function normalizeIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  const i = Math.trunc(index);
  if (i < 0) return Math.max(length + i, 0);
  return Math.min(i, length);
}

export default function useArrayImmutable<T>(
  initialSnapshot?: ResolvedInit<T>,
): ImmutableReactiveArray<T> {
  /**
   * 初始快照只解析一次：
   * - 允许传数组或可迭代对象（Iterable）
   * - 解析后固定为初始“基准值”，供 reset 使用
   */
  const initialSnapshotRef = useRef<T[] | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = toArray<T>(initialSnapshot);
  }

  /**
   * immutable：状态本体是一个“真正的数组引用”
   * 每次内容变化我们都会生成 next（新数组），用 setState 更新引用
   */
  const [arrayState, setArrayState] = useState<T[]>(() => initialSnapshotRef.current!.slice());

  /**
   * latestRef：用于解决同一 tick 内连续写操作的“顺序语义”问题
   * - setState 是异步批处理的，连续调用时读 arrayState 可能还是旧的
   * - 我们在 commit 时同步写 latestRef.current，后续读写都以它为准
   */
  const latestRef = useLatestRef(arrayState);

  /**
   * 依赖 arrayState 是刻意设计：
   * - immutable 模式需要“内容变化 => 返回新引用”
   * - 这样才能自然用于 deps / memo / useEffect 比较
   */
  const proxy = useMemo(() => {
    /**
     * cache：把包装后的函数缓存起来，保证：
     * - 同一个 prop（如 push、replace）每次 get 得到的都是同一个函数引用
     * - 避免每次渲染都创建新函数导致 memo/deps 失效
     */
    const cache = new Map<PropertyKey, any>();

    /**
     * dummyTarget：Proxy 的 target
     * 为什么不用真实数组当 target？
     * - 我们希望所有“真实数据”都来自 latestRef.current（最新状态）
     * - dummyTarget 只是承载“自定义属性”的容器（比如你给 proxy 挂一些字段）
     *
     * 为什么要断开原型链？
     * - 防止从 dummyTarget 的原型链泄漏 Array.prototype 方法
     * - 否则 get 时可能意外拿到原生 push/splice，绕开我们的拦截逻辑
     */
    const dummyTarget: any[] = [];
    Object.setPrototypeOf(dummyTarget, null);

    /**
     * commit：统一提交更新
     * - 先同步更新 latestRef.current，保证同 tick 内后续操作读到的是最新值
     * - 再 setState 触发 React 更新（批处理由 React 自己负责）
     */
    const commit = (next: T[]) => {
      latestRef.current = next;
      setArrayState(next);
    };

    /**
     * swap 需要保留 “holes（空槽）” 语义：
     * - hole 和 undefined 不等价（`i in arr` 的结果不同）
     * - 这里用 `i in arr` 来判断该位是否存在，交换时用 delete 维护空槽
     */
    const ensureSwap = (array: T[], leftIndex: number, rightIndex: number) => {
      if (leftIndex === rightIndex) return;

      // 用局部引用，避免 no-param-reassign（仍然是原地修改同一个数组）
      const list = array as any[];

      // hole 语义：用 `in` 判断该索引是否真实存在（hole !== undefined）
      const leftExists = leftIndex in list;
      const rightExists = rightIndex in list;

      const leftValue = list[leftIndex];
      const rightValue = list[rightIndex];

      // 把 left 放到 right（若 left 是 hole，则 delete 保持 hole）
      if (leftExists) list[rightIndex] = leftValue;
      else delete list[rightIndex];

      // 把 right 放到 left（若 right 是 hole，则 delete 保持 hole）
      if (rightExists) list[leftIndex] = rightValue;
      else delete list[leftIndex];
    };

    /**
     * handler：核心是 get/set/deleteProperty/has
     * - get：返回扩展方法、拦截原生变更方法、转发只读方法、读取 length/index
     * - set：支持 arr[i]=x、arr.length=0 等原生写法，并触发更新
     * - deleteProperty：支持 delete arr[i] 产生 hole
     * - has：支持 `i in arr` 的语义
     */
    const handler: ProxyHandler<any[]> = {
      get(target, prop, receiver) {
        const cur = latestRef.current;

        /**
         * 1) length / index 必须优先：
         * - dummyTarget 自己也有 length（初始为 0），如果先读 dummyTarget 会导致“永远 empty”
         * - 数组下标也是同理，必须从最新数组 cur 读取
         */
        if (prop === 'length') return cur.length;

        // isArrayIndex 会过滤掉 '01' / '1.0' 等非规范索引字符串
        if (isArrayIndex(prop)) {
          const idx = Number(prop);
          return (cur as any)[idx];
        }

        /**
         * 2) 允许读自定义属性（挂在 dummyTarget 上）
         * - 这类属性不参与响应式更新
         * - dummyTarget 原型链断开后，这里只会命中你显式写入的字段
         */
        if (Object.prototype.hasOwnProperty.call(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }

        /**
         * 3) 缓存命中：直接返回已包装好的函数/值
         */
        if (cache.has(prop)) return cache.get(prop);

        // --- 扩展方法：返回“链式友好”的 API（大多数返回 receiver） ---
        if (prop === 'replace') {
          const fn = (nextInput: T[] | Iterable<T>) => {
            const next = toArray<T>(nextInput);
            commit(next);
            return receiver as ImmutableReactiveArray<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'reset') {
          const fn = () => {
            commit(initialSnapshotRef.current!.slice());
            return receiver as ImmutableReactiveArray<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'clear') {
          const fn = () => {
            const now = latestRef.current;
            if (now.length === 0) return;
            commit([]);
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'insert') {
          const fn = (index: number, ...items: T[]) => {
            if (items.length === 0) return receiver as ImmutableReactiveArray<T>;
            const now = latestRef.current;
            const next = now.slice(); // slice：尽量保留 holes 语义
            const at = normalizeIndex(index, next.length);
            next.splice(at, 0, ...items);
            commit(next);
            return receiver as ImmutableReactiveArray<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'removeAt') {
          const fn = (index: number, count = 1) => {
            const now = latestRef.current;
            if (now.length === 0) return [];
            const next = now.slice();
            const at = normalizeIndex(index, next.length);
            const removed = next.splice(at, Math.max(0, Math.trunc(count)));
            // removed 为空说明没有实际变化，就不触发更新
            if (removed.length > 0) commit(next);
            return removed;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'move') {
          const fn = (from: number, to: number) => {
            const now = latestRef.current;
            if (now.length === 0) return receiver as ImmutableReactiveArray<T>;

            const next = now.slice();
            const fromIdx = normalizeIndex(from, next.length);
            const toIdx = normalizeIndex(to, next.length);
            if (fromIdx === toIdx) return receiver as ImmutableReactiveArray<T>;

            const removed = next.splice(fromIdx, 1);
            if (removed.length === 0) return receiver as ImmutableReactiveArray<T>;

            next.splice(toIdx, 0, removed[0] as any);
            commit(next);
            return receiver as ImmutableReactiveArray<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'swap') {
          const fn = (i: number, j: number) => {
            const now = latestRef.current;
            if (now.length === 0) return receiver as ImmutableReactiveArray<T>;

            const next = now.slice();
            const ii = normalizeIndex(i, next.length);
            const jj = normalizeIndex(j, next.length);
            if (ii === jj) return receiver as ImmutableReactiveArray<T>;

            ensureSwap(next, ii, jj);
            commit(next);
            return receiver as ImmutableReactiveArray<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'batch') {
          const fn = (mutator: (draft: T[]) => void) => {
            const now = latestRef.current;
            const draft = now.slice(); // 保留 holes
            mutator(draft);

            // shallow 对比：无变化就跳过 setState，避免无意义渲染
            if (isSameArray(now, draft)) return receiver as ImmutableReactiveArray<T>;

            commit(draft);
            return receiver as ImmutableReactiveArray<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'toArray') {
          // plain snapshot：防止把 proxy 作为参数传给第三方导致意外触发 trap
          const fn = () => latestRef.current.slice();
          cache.set(prop, fn);
          return fn;
        }

        /**
         * --- 原生会变更数组的方法：拦截并触发更新 ---
         * 统一策略：
         * - 基于 cur 复制出 next（immutable）
         * - 调用对应原生方法在 next 上执行
         * - commit(next) 触发 React 更新
         */
        if (prop === 'push') {
          const fn = (...items: T[]) => {
            const now = latestRef.current;
            if (items.length === 0) return now.length;

            const next = now.slice();
            const len = next.push(...items);
            commit(next);
            return len;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'pop') {
          const fn = () => {
            const now = latestRef.current;
            if (now.length === 0) return undefined;

            const next = now.slice();
            const out = next.pop();
            commit(next);
            return out;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'unshift') {
          const fn = (...items: T[]) => {
            const now = latestRef.current;
            if (items.length === 0) return now.length;

            const next = now.slice();
            const len = next.unshift(...items);
            commit(next);
            return len;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'shift') {
          const fn = () => {
            const now = latestRef.current;
            if (now.length === 0) return undefined;

            const next = now.slice();
            const out = next.shift();
            commit(next);
            return out;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'splice') {
          const fn = (start: number, deleteCount?: number, ...items: T[]) => {
            // 显式 deleteCount=0 且无插入 → no-op
            if (deleteCount === 0 && items.length === 0) return [];

            const now = latestRef.current;
            const next = now.slice();
            const removed = (next as any).splice(start, deleteCount as any, ...items);
            commit(next);
            return removed as T[];
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'sort') {
          const fn = (compareFn?: (a: T, b: T) => number) => {
            const now = latestRef.current;
            if (now.length <= 1) return receiver as ImmutableReactiveArray<T>;

            const next = now.slice();
            next.sort(compareFn);
            commit(next);
            return receiver as ImmutableReactiveArray<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'reverse') {
          const fn = () => {
            const now = latestRef.current;
            if (now.length <= 1) return receiver as ImmutableReactiveArray<T>;

            const next = now.slice();
            next.reverse();
            commit(next);
            return receiver as ImmutableReactiveArray<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'fill') {
          const fn = (value: T, start?: number, end?: number) => {
            const now = latestRef.current;
            if (now.length === 0) return receiver as ImmutableReactiveArray<T>;

            const next = now.slice();
            (next as any).fill(value, start as any, end as any);
            commit(next);
            return receiver as ImmutableReactiveArray<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        if (prop === 'copyWithin') {
          const fn = (targetIdx: number, start?: number, end?: number) => {
            const now = latestRef.current;
            if (now.length === 0) return receiver as ImmutableReactiveArray<T>;

            const next = now.slice();
            (next as any).copyWithin(targetIdx as any, start as any, end as any);
            commit(next);
            return receiver as ImmutableReactiveArray<T>;
          };
          cache.set(prop, fn);
          return fn;
        }

        /**
         * --- 原生只读方法/符号方法：转发到最新数组 ---
         * 注意：prop 可能是 Symbol.iterator 等 symbol
         * - 不要从 target 取（target 是 dummy），否则迭代/展开会变成“空”
         * - 要从 Array.prototype 取方法定义，再 apply 到最新数组
         */
        const protoVal = (Array.prototype as any)[prop];
        if (typeof protoVal === 'function') {
          const fn = (...args: any[]) => protoVal.apply(latestRef.current, args);
          cache.set(prop, fn);
          return fn;
        }
        // 比如 Symbol.toStringTag 这类非函数属性，直接返回原型上的定义
        if (protoVal !== undefined) return protoVal;

        // 兜底：从最新数组上取值（比如自定义挂在数组实例上的字段）
        return (cur as any)[prop];
      },

      set(target, prop, value, receiver) {
        /**
         * symbol：允许作为“自定义字段”写入 dummyTarget（不触发更新）
         * 这样不会污染真实数组，也不会影响响应式语义
         */
        if (typeof prop === 'symbol') {
          return Reflect.set(target, prop, value, receiver);
        }

        /**
         * 非 index/length：当成自定义字段写入 dummyTarget（不触发更新）
         * - 例如：arr.foo = 123
         * - 例如：arr.meta = ...
         */
        if (!isArrayIndex(prop) && prop !== 'length') {
          return Reflect.set(target, prop, value, receiver);
        }

        const cur = latestRef.current;

        /**
         * 支持原生语法：arr.length = N
         * - N 可能是字符串/浮点等，toLength 负责规范化
         * - 截断会删除尾部元素
         * - 扩容会产生 holes（空槽）
         */
        if (prop === 'length') {
          const nextLen = toLength(value);
          if (nextLen === cur.length) return true;

          const next = cur.slice();
          next.length = nextLen;
          commit(next);
          return true;
        }

        /**
         * 支持原生语法：arr[i] = x
         * 这里需要注意 holes 语义：
         * - 如果该位原本不存在（hole），读出来是 undefined，但 `i in arr` 为 false
         * - 所以只有“原本就存在该索引且值相同”才算 no-op
         */
        const idx = Number(prop);
        const hasIdx = idx in cur;
        const prev = (cur as any)[idx];

        if (hasIdx && Object.is(prev, value)) return true;

        const next = cur.slice();
        (next as any)[idx] = value;
        commit(next);
        return true;
      },

      deleteProperty(_target, prop) {
        /**
         * 支持：delete arr[i]
         * - delete 会形成 hole（空槽）
         * - 若本来就是 hole，则 no-op
         */
        if (!isArrayIndex(prop)) return true;

        const cur = latestRef.current;
        const idx = Number(prop);
        if (!(idx in cur)) return true;

        const next = cur.slice();
        delete (next as any)[idx];
        commit(next);
        return true;
      },

      has(_target, prop) {
        /**
         * 支持：`prop in arr`
         * - length 永远存在
         * - index：取决于是否为 hole（`idx in arr`）
         * - 其它属性：既可能在实例上，也可能在 Array.prototype 上
         */
        if (prop === 'length') return true;
        if (isArrayIndex(prop)) return prop in latestRef.current;
        if (prop in latestRef.current) return true;
        return prop in Array.prototype;
      },

      /**
       * ownKeys：拦截 `Reflect.ownKeys(proxy)` / `Object.getOwnPropertyNames` / `Object.getOwnPropertySymbols`
       * 以及很多“深比较/序列化/断言工具”内部的 key 枚举流程（例如 Jest 的 toEqual）。
       *
       * 在我们的实现里：
       * - Proxy 的 target 是 dummyTarget（几乎为空），真实数据在 latestRef.current。
       * - 如果不实现 ownKeys，外部枚举到的 keys 会更接近 dummyTarget：
       *   - 可能只看到空数组的 keys（甚至只看到 'length'），导致 deep equal 判断失败；
       *   - 你看到“打印出来像 [1,2,3]”，但比较系统认为“没有这些下标键”，就会出现：
       *     Received: serializes to the same string
       *
       * 所以 ownKeys 必须返回“真实数组”应该暴露出来的自有键：
       * - 下标键（'0','1','2'...，注意是 string）
       * - 'length'
       * - 以及 dummyTarget 上的自定义属性（我们允许用户挂一些字段）
       *
       * 另外：Proxy 有 invariant（不变量）约束：
       * - target 上的不可配置（non-configurable）key 必须出现在 ownKeys 的结果里
       * - 因此我们会把 targetKeys 也合并进去，避免触发运行时 TypeError。
       */
      ownKeys(target) {
        // 让外部“枚举 keys”时看到真实数组的 keys（下标 + length + 自定义属性）
        const curKeys = Reflect.ownKeys(latestRef.current);
        const targetKeys = Reflect.ownKeys(target);

        // 手写去重：避免用 Set<PropertyKey> 把 number 引进类型系统
        const seen = new Set<string | symbol>();
        const out: Array<string | symbol> = [];

        for (const k of curKeys) {
          if (!seen.has(k)) {
            seen.add(k);
            out.push(k);
          }
        }

        // 必须把 targetKeys 也合进来：保证包含 target 的不可配置 key（Proxy invariant）
        for (const k of targetKeys) {
          if (!seen.has(k)) {
            seen.add(k);
            out.push(k);
          }
        }

        return out;
      },

      /**
       * getOwnPropertyDescriptor：拦截 `Object.getOwnPropertyDescriptor(proxy, key)`
       * 以及“枚举/深比较/拷贝/序列化”过程中对属性描述符的读取。
       *
       * 为什么需要它？
       * - 很多工具在做 deep equal 时，不只看 key 是否存在，还会读取 descriptor：
       *   - 例如数组下标属性是否 enumerable（可枚举）
       *   - length 是否 writable（可写）、是否 configurable（可配置）
       *   - 以及某个下标是否真的存在（hole vs undefined）
       *
       * 在我们的实现里：
       * - 真实数据在 latestRef.current；
       * - 如果不实现这个 trap，descriptor 会从 dummyTarget 上取到“空数组的描述”，
       *   导致外部认为这些下标键不存在，从而 deep equal 失败。
       *
       * 这个 trap 一般要处理几类情况：
       * 1) dummyTarget 上的自定义属性：
       *    - 直接返回 target 的 descriptor（这类不参与响应式更新）
       *
       * 2) 'length'：
       *    - 数组 length 的特征很特殊：不可配置（configurable: false）、不可枚举（enumerable: false）
       *    - 我们需要返回与真实数组一致的 descriptor，避免行为/断言工具误判
       *
       * 3) 数组下标（'0','1','2'...）：
       *    - 只有当该索引“真的存在”（idx in arr 为 true）才返回 descriptor
       *    - 这样才能正确表达 hole 语义：
       *      - hole：读出来可能是 undefined，但 descriptor 不存在（`idx in arr` 为 false）
       *      - 真正的 undefined：descriptor 存在且 value 为 undefined
       *
       * 4) 其它真实数组实例上的自有属性（很少见）：
       *    - 尝试从真实数组上拿 descriptor 兜底返回
       *
       * 这样做的目的：让 proxy 在“外部观察者”（枚举/比较/序列化）视角下尽量像一个真正的数组。
       */
      getOwnPropertyDescriptor(target, prop) {
        // 1) dummyTarget 上的自定义属性：按 target 的描述符走
        if (Object.prototype.hasOwnProperty.call(target, prop)) {
          return Reflect.getOwnPropertyDescriptor(target, prop);
        }

        const cur = latestRef.current;

        // 2) length：按数组 length 的属性特征返回（非枚举、可写、不可配置）
        if (prop === 'length') {
          return {
            configurable: false,
            enumerable: false,
            writable: true,
            value: cur.length,
          };
        }

        // 3) 下标：只在“真实存在该索引”（非 hole）时返回描述符
        if (isArrayIndex(prop)) {
          const idx = Number(prop);
          if (!(idx in cur)) return undefined;

          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: (cur as any)[idx],
          };
        }

        // 4) 其它“挂在真实数组实例上的自有属性”（一般很少见）
        const desc = Reflect.getOwnPropertyDescriptor(cur as any, prop);
        if (desc) return desc;

        return undefined;
      },

      /**
       * 让 proxy 的原型表现得像 Array：
       * - instanceof Array 可用
       * - 其它原型方法（只读方法）也能通过 get 中的 protoVal 转发正常工作
       */
      getPrototypeOf() {
        return Array.prototype;
      },
    };

    return new Proxy(dummyTarget, handler) as unknown as ImmutableReactiveArray<T>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrayState]);

  return proxy;
}
