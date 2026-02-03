// useToggle 切换状态

import { useState } from 'react';

export interface ToggleActions<T> {
  setLeft: () => void;
  setRight: () => void;
  set: (val: T) => void;
  toggle: () => void;
}

// 重载声明1：无参数
function useToggle<T = boolean>(): [T, ToggleActions<T>];
// 重载声明2：一个参数
function useToggle<T>(defaultValue: T): [T, ToggleActions<T>];
// 重载声明3：两个参数
function useToggle<T, U>(defaultValue: T, reverseValue: U): [T | U, ToggleActions<T | U>];

/**
 * 场景：类似于开关
 * 1. useToggle() 不传参的相当于是 useBoolean，初始值为 false
 * 2. useToggle(a) 传参一个的情况下，参数必须是 boolean 类型
 * 3. useToggle(a, b) 传参两个的情况下，在 a 和 b 之间切换
 * @param {T} defaultValue
 * @param {T} reverseValue
 */
function useToggle<T = boolean, U = T>(
  defaultValue?: T,
  reverseValue?: U,
): [T | U, ToggleActions<T | U>] {
  // 处理默认值
  const initialValue = defaultValue ?? (false as T);
  const altValue = reverseValue ?? (!initialValue as unknown as U);

  const [state, setState] = useState<T | U>(initialValue);

  const setLeft = () => {
    setState(initialValue);
  };

  const setRight = () => {
    setState(altValue);
  };

  const set = setState;

  // 这里直接使用state判断会有闭包问题，因此必须使用函数式更新
  const toggle = () => {
    setState((current: T | U) => (current === initialValue ? altValue : initialValue));
  };

  const actions = {
    setLeft,
    setRight,
    set,
    toggle,
  };

  return [state, actions];
}

export default useToggle;
