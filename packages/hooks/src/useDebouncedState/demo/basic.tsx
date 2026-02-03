/**
 * title: 基础用法
 * description: 输入值实时更新，但防抖值延迟 500ms 更新
 */

import React from 'react'; // 这边导入 React 是因为 JSX 需要 React 作用域
import { Input } from 'antd';
import { useDebouncedState } from 'tx-hooks';

export default () => {
  const [value, setValue, debouncedValue] = useDebouncedState('', {
    delay: 500,
  });

  return (
    <div style={{ maxWidth: 400 }}>
      <Input
        placeholder="请输入内容（500ms 防抖）"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      <div style={{ marginTop: 16 }}>
        <div>实时值：{value}</div>
        <div>
          防抖值：
          {debouncedValue === undefined ? '（未触发）' : debouncedValue}
        </div>
      </div>
    </div>
  );
};
