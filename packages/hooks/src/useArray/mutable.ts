import { useRef } from 'react';
import { useForceUpdate } from '../_internal/react/useForceUpdate';
import { isArrayIndex, toArray, toLength, type ResolvedInit } from './utils';

export type MutableReactiveArray<T> = T[] & {
  replace: (next: T[] | Iterable<T>) => MutableReactiveArray<T>;
  reset: () => MutableReactiveArray<T>;
  clear: () => void;

  insert: (index: number, ...items: T[]) => MutableReactiveArray<T>;
  removeAt: (index: number, count?: number) => T[];

  move: (from: number, to: number) => MutableReactiveArray<T>;
  swap: (i: number, j: number) => MutableReactiveArray<T>;

  /**
   * 批处理：允许用户在同一个 draft（同一个数组引用）上做多步修改
   * mutable 模式下：draft 就是 arrayRef.current 本体
   */
  batch: (mutator: (draft: T[]) => void) => MutableReactiveArray<T>;

  /**
   * plain 快照：避免把 proxy 传给第三方
   */
  toArray: () => T[];

  /**
   * 内容真实变化时递增：用于 deps/memo 语义
   * - mutable 模式下数组引用不会变，因此需要一个“版本号”来代表内容变化
   * - 例如：useEffect(() => {}, [arr.getVersion()])
   */
  getVersion: () => number;
};

/**
 * 统一索引归一化：支持负数索引（从尾部倒数）
 * - 非法值（NaN/Infinity）按 0 处理
 * - 负数：length + i（最小到 0）
 * - 正数：最大到 length
 */
function normalizeIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;

  const normalizedIndex: number = Math.trunc(index);
  const arrayLength: number = length;

  if (normalizedIndex < 0) return Math.max(arrayLength + normalizedIndex, 0);
  return Math.min(normalizedIndex, arrayLength);
}

export default function useArrayMutable<T>(
  initialSnapshot?: ResolvedInit<T>,
): MutableReactiveArray<T> {
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
   * mutable：不走 setState 存数组，因为我们要“数组引用稳定”
   * 触发更新用 useForceUpdate（内部就是触发一次 rerender）
   */
  const forceUpdate = useForceUpdate();

  /**
   * arrayRef：真实数组本体（会被原地修改）
   * - mutable 的核心语义：这个引用永远不变
   * - 所有读写都围绕 arrayRef.current
   */
  const arrayRef = useRef<T[]>(initialSnapshotRef.current!.slice());

  /**
   * versionRef：内容变化版本号
   * - 每次“确认有变化”后递增，用于 deps/memo 语义
   */
  const versionRef = useRef(0);

  /**
   * bump：一次“确认变化”的统一出口
   * - 递增 version
   * - 触发一次 rerender
   *
   * 注意：React 会批处理同一事件循环内的多次更新（由 React 自己负责）
   */
  const bump = () => {
    versionRef.current += 1;
    forceUpdate();
  };

  /**
   * cacheRef：缓存包装函数，保证：
   * - 同一个 prop（如 push、replace）每次 get 得到的都是同一个函数引用
   * - 避免每次渲染都创建新函数，导致 memo/deps 失效
   */
  const cacheRef = useRef<Map<PropertyKey, any> | null>(null);
  if (cacheRef.current === null) cacheRef.current = new Map<PropertyKey, any>();

  /**
   * proxyRef：Proxy 实例只创建一次（mutable 不需要随内容变化重新创建）
   */
  const proxyRef = useRef<MutableReactiveArray<T> | null>(null);

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
   * getCustom：扩展方法 + 变更方法拦截（统一在这里生成包装函数）
   *
   * 为什么只处理 string key？
   * - Proxy 的 prop 可能是 symbol（例如 Symbol.iterator）
   * - 如果直接拿 prop 去和 'replace' 这种 string 比较，TS 会报 ts2367
   * - symbol 的原型方法会交给 wrapProto 处理
   */
  const getCustom = (prop: PropertyKey, receiver: any) => {
    if (typeof prop !== 'string') return undefined;

    const cache = cacheRef.current!;
    if (cache.has(prop)) return cache.get(prop);

    // 版本号：用于 deps/memo
    if (prop === 'getVersion') {
      const fn = () => versionRef.current;
      cache.set(prop, fn);
      return fn;
    }

    /**
     * replace：整体替换内容
     * - 注意：mutable 模式下仍然保持 proxy 引用不变
     * - 只是把 arrayRef.current 指向新数组，并 bump
     */
    if (prop === 'replace') {
      const fn = (nextInput: T[] | Iterable<T>) => {
        arrayRef.current = toArray<T>(nextInput);
        bump();
        return receiver as MutableReactiveArray<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    // reset：恢复到初始快照
    if (prop === 'reset') {
      const fn = () => {
        arrayRef.current = initialSnapshotRef.current!.slice();
        bump();
        return receiver as MutableReactiveArray<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    // clear：清空（等价于 length=0）
    if (prop === 'clear') {
      const fn = () => {
        if (arrayRef.current.length === 0) return;
        arrayRef.current.length = 0;
        bump();
      };
      cache.set(prop, fn);
      return fn;
    }

    // insert：插入
    if (prop === 'insert') {
      const fn = (index: number, ...items: T[]) => {
        if (items.length === 0) return receiver as MutableReactiveArray<T>;
        const cur = arrayRef.current;
        const at = normalizeIndex(index, cur.length);
        cur.splice(at, 0, ...items);
        bump();
        return receiver as MutableReactiveArray<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    // removeAt：按位置删除（返回被删除元素）
    if (prop === 'removeAt') {
      const fn = (index: number, count = 1) => {
        const cur = arrayRef.current;
        if (cur.length === 0) return [];
        const at = normalizeIndex(index, cur.length);
        const removed = cur.splice(at, Math.max(0, Math.trunc(count)));
        // removed 为空说明没有实际变化，就不 bump
        if (removed.length > 0) bump();
        return removed;
      };
      cache.set(prop, fn);
      return fn;
    }

    // move：移动元素位置
    if (prop === 'move') {
      const fn = (from: number, to: number) => {
        const cur = arrayRef.current;
        if (cur.length === 0) return receiver as MutableReactiveArray<T>;

        const fromIdx = normalizeIndex(from, cur.length);
        const toIdx = normalizeIndex(to, cur.length);
        if (fromIdx === toIdx) return receiver as MutableReactiveArray<T>;

        const removed = cur.splice(fromIdx, 1);
        if (removed.length === 0) return receiver as MutableReactiveArray<T>;

        cur.splice(toIdx, 0, removed[0] as any);
        bump();
        return receiver as MutableReactiveArray<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    // swap：交换两个位置（保留 holes 语义）
    if (prop === 'swap') {
      const fn = (i: number, j: number) => {
        const cur = arrayRef.current;
        if (cur.length === 0) return receiver as MutableReactiveArray<T>;

        const ii = normalizeIndex(i, cur.length);
        const jj = normalizeIndex(j, cur.length);
        if (ii === jj) return receiver as MutableReactiveArray<T>;

        ensureSwap(cur, ii, jj);
        bump();
        return receiver as MutableReactiveArray<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    /**
     * batch：把多步写操作合并为一次 bump
     * - mutable 下 draft 就是 arrayRef.current 本体
     * - 你在 mutator 里可以 push/splice/赋值等
     */
    if (prop === 'batch') {
      const fn = (mutator: (draft: T[]) => void) => {
        mutator(arrayRef.current);
        bump();
        return receiver as MutableReactiveArray<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    // plain snapshot：用于把“真实数组”交给第三方（不带 proxy 行为）
    if (prop === 'toArray') {
      const fn = () => arrayRef.current.slice();
      cache.set(prop, fn);
      return fn;
    }

    /**
     * --- 原生会变更数组的方法：拦截并 bump ---
     * 统一策略：
     * - 直接在 arrayRef.current 上原地调用原生方法
     * - 再 bump 通知 React 重新渲染
     *
     * 这里做一些简单 no-op 判断，减少无意义渲染
     */
    if (prop === 'push') {
      const fn = (...items: T[]) => {
        if (items.length === 0) return arrayRef.current.length;
        const len = arrayRef.current.push(...items);
        bump();
        return len;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'pop') {
      const fn = () => {
        if (arrayRef.current.length === 0) return undefined;
        const out = arrayRef.current.pop();
        bump();
        return out;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'unshift') {
      const fn = (...items: T[]) => {
        if (items.length === 0) return arrayRef.current.length;
        const len = arrayRef.current.unshift(...items);
        bump();
        return len;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'shift') {
      const fn = () => {
        if (arrayRef.current.length === 0) return undefined;
        const out = arrayRef.current.shift();
        bump();
        return out;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'splice') {
      const fn = (start: number, deleteCount?: number, ...items: T[]) => {
        // 显式 deleteCount=0 且无插入 → no-op
        if (deleteCount === 0 && items.length === 0) return [];
        const removed = (arrayRef.current as any).splice(
          start,
          deleteCount as any,
          ...items,
        ) as T[];
        bump();
        return removed;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'sort') {
      const fn = (compareFn?: (a: T, b: T) => number) => {
        if (arrayRef.current.length <= 1) return receiver as MutableReactiveArray<T>;
        arrayRef.current.sort(compareFn);
        bump();
        return receiver as MutableReactiveArray<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'reverse') {
      const fn = () => {
        if (arrayRef.current.length <= 1) return receiver as MutableReactiveArray<T>;
        arrayRef.current.reverse();
        bump();
        return receiver as MutableReactiveArray<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'fill') {
      const fn = (value: T, start?: number, end?: number) => {
        if (arrayRef.current.length === 0) return receiver as MutableReactiveArray<T>;
        (arrayRef.current as any).fill(value, start as any, end as any);
        bump();
        return receiver as MutableReactiveArray<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    if (prop === 'copyWithin') {
      const fn = (targetIdx: number, start?: number, end?: number) => {
        if (arrayRef.current.length === 0) return receiver as MutableReactiveArray<T>;
        (arrayRef.current as any).copyWithin(targetIdx as any, start as any, end as any);
        bump();
        return receiver as MutableReactiveArray<T>;
      };
      cache.set(prop, fn);
      return fn;
    }

    return undefined;
  };

  /**
   * wrapProto：原生只读方法/符号方法的转发
   * - 例如：map/forEach/includes/join
   * - 以及 Symbol.iterator（用于展开、Array.from 等）
   *
   * 注意：这里只转发“函数型”的原型方法；
   * 非函数的原型属性（比如 Symbol.toStringTag）会走 get 的兜底 Reflect.get(arrayRef.current,...)
   */
  const wrapProto = (prop: PropertyKey) => {
    const cache = cacheRef.current!;
    if (cache.has(prop)) return cache.get(prop);

    const protoFn = (Array.prototype as any)[prop];
    if (typeof protoFn !== 'function') return undefined;

    // apply 到真实数组本体，保证行为与原生一致
    const fn = (...args: any[]) => protoFn.apply(arrayRef.current, args);
    cache.set(prop, fn);
    return fn;
  };

  if (proxyRef.current === null) {
    /**
     * dummyTarget：Proxy 的 target
     * - 只负责承载“自定义属性”
     * - 不承载真实数组数据，真实数据在 arrayRef.current
     *
     * 为什么断开原型链？
     * - 防止从 dummyTarget 原型链拿到 Array.prototype 方法，绕过我们的拦截
     */
    const dummyTarget: any[] = [];
    Object.setPrototypeOf(dummyTarget, null);

    const handler: ProxyHandler<any[]> = {
      get(target, prop, receiver) {
        /**
         * 1) length 必须优先：
         * - dummyTarget 自己也有 length（初始 0），如果先读 dummyTarget 会导致“永远 empty”
         */
        if (prop === 'length') return arrayRef.current.length;

        /**
         * 2) index 读也必须优先：
         * - 仅当 prop 是规范的数组索引字符串，才当成下标读取
         * - 这样 '01' / '1.0' 不会被误认为数组索引
         */
        if (typeof prop === 'string' && isArrayIndex(prop)) {
          const idx = Number(prop);
          return (arrayRef.current as any)[idx];
        }

        /**
         * 3) 允许读 dummyTarget 的自定义属性（包括 symbol）
         * - 自定义属性不触发 bump
         */
        if (Object.prototype.hasOwnProperty.call(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }

        /**
         * 4) 扩展方法（只处理 string key）
         * - 例如 replace/reset/insert 等
         * - 以及我们拦截过的 push/splice 等
         */
        const custom = getCustom(prop, receiver);
        if (custom) return custom;

        /**
         * 5) 原生原型方法（包括 Symbol.iterator）
         * - 只读方法：不 bump，直接 apply 到真实数组
         */
        const wrapped = wrapProto(prop);
        if (wrapped) return wrapped;

        /**
         * 6) 其它属性兜底：从真实数组取
         * - 例如：arr[Symbol.toStringTag] / arr.constructor / arr.length（length 已提前返回）
         */
        return Reflect.get(arrayRef.current as any, prop);
      },

      set(target, prop, value, receiver) {
        /**
         * symbol：作为自定义字段写入 dummyTarget（不触发更新）
         * - 避免污染真实数组本体
         */
        if (typeof prop === 'symbol') {
          return Reflect.set(target, prop, value, receiver);
        }

        /**
         * 非 index/length：当成自定义字段写入 dummyTarget（不触发更新）
         * - 例如：arr.foo = 123
         */
        if (!isArrayIndex(prop) && prop !== 'length') {
          return Reflect.set(target, prop, value, receiver);
        }

        /**
         * 支持原生语法：arr.length = N
         * - toLength 负责规范化（字符串/浮点等）
         * - 截断会删除尾部元素
         * - 扩容会产生 holes（空槽）
         */
        if (prop === 'length') {
          const nextLen = toLength(value);
          if (nextLen === arrayRef.current.length) return true;

          arrayRef.current.length = nextLen;
          bump();
          return true;
        }

        /**
         * 支持原生语法：arr[i] = x
         * holes 语义：
         * - 如果该位原本不存在（hole），读出来是 undefined，但 `i in arr` 为 false
         * - 所以只有“原本就存在该索引且值相同”才算 no-op
         */
        const idx = Number(prop);
        const cur = arrayRef.current;
        const hasIdx = idx in cur;
        const prev = (cur as any)[idx];

        if (hasIdx && Object.is(prev, value)) return true;

        (cur as any)[idx] = value;
        bump();
        return true;
      },

      deleteProperty(_target, prop) {
        /**
         * 支持：delete arr[i]
         * - delete 会形成 hole（空槽）
         * - 若本来就是 hole，则 no-op
         */
        if (!(typeof prop === 'string' && isArrayIndex(prop))) return true;

        const idx = Number(prop);
        const cur = arrayRef.current;
        if (!(idx in cur)) return true;

        delete (cur as any)[idx];
        bump();
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
        if (typeof prop === 'string' && isArrayIndex(prop)) return prop in arrayRef.current;
        if (prop in arrayRef.current) return true;
        return prop in Array.prototype;
      },

      /**
       * ownKeys：拦截 `Reflect.ownKeys(proxy)` / `Object.getOwnPropertyNames` / `Object.getOwnPropertySymbols`
       * 以及很多“深比较/序列化/断言工具”内部的 key 枚举流程（例如 Jest 的 toEqual）。
       *
       * 在我们的实现里：
       * - Proxy 的 target 是 dummyTarget（几乎为空），真实数据在 arrayRef.current。
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
        const curKeys = Reflect.ownKeys(arrayRef.current);
        const targetKeys = Reflect.ownKeys(target);

        const seen = new Set<string | symbol>();
        const out: Array<string | symbol> = [];

        for (const k of curKeys) {
          if (!seen.has(k)) {
            seen.add(k);
            out.push(k);
          }
        }

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
       * - 真实数据在 arrayRef.current；
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
        if (Object.prototype.hasOwnProperty.call(target, prop)) {
          return Reflect.getOwnPropertyDescriptor(target, prop);
        }

        const cur = arrayRef.current;

        if (prop === 'length') {
          return {
            configurable: false,
            enumerable: false,
            writable: true,
            value: cur.length,
          };
        }

        if (typeof prop === 'string' && isArrayIndex(prop)) {
          const idx = Number(prop);
          if (!(idx in cur)) return undefined;

          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: (cur as any)[idx],
          };
        }

        const desc = Reflect.getOwnPropertyDescriptor(cur as any, prop);
        if (desc) return desc;

        return undefined;
      },

      /**
       * 让 proxy 的原型表现得像 Array：
       * - instanceof Array 可用
       * - 原型方法会通过 get 中的 wrapProto 转发到真实数组
       */
      getPrototypeOf() {
        return Array.prototype;
      },
    };

    proxyRef.current = new Proxy(dummyTarget, handler) as unknown as MutableReactiveArray<T>;
  }

  return proxyRef.current;
}
