/**
 * title: 开启 skipInitial
 * description: 首次渲染时，debouncedState 为 undefined，防止触发不必要的副作用（常用于避免初始化请求）。
 */

import React, { useEffect, useState } from 'react';
import { Input, Spin } from 'antd';
import { useDebouncedState } from 'tx-hooks';

/**
 * 模拟异步请求
 */
function mockRequest(keyword: string): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('请求返回结果');
      resolve(`请求结果：${keyword || '无'}`);
    }, 800);
  });
}

/**
 * 子组件：只负责输入 + 防抖
 */
function SearchInput(props: { onDebouncedChange: (value: string | undefined) => void }) {
  const [value, setValue, debouncedValue] = useDebouncedState('', {
    delay: 500,
    skipInitial: true,
  });

  useEffect(() => {
    props.onDebouncedChange(debouncedValue);
  }, [debouncedValue]);

  return (
    <Input
      placeholder="请输入搜索关键字"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

/**
 * 父组件：根据 debouncedValue 触发请求
 */
export default () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleDebouncedChange = async (value?: string) => {
    // skipInitial 的关键点：undefined 表示「还未真正触发」
    if (value === undefined) return;

    setLoading(true);
    setResult(null);
    const res = await mockRequest(value);
    setResult(res);
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 400 }}>
      <SearchInput onDebouncedChange={handleDebouncedChange} />

      <div style={{ marginTop: 16 }}>
        {loading && <Spin />}
        {!loading && result && <div>{result}</div>}
        {!loading && !result && <div style={{ color: '#888' }}>暂无请求结果</div>}
      </div>
    </div>
  );
};
