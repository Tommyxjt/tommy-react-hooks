/**
 * title: 开启 leading
 * description: 首次变更立即触发，后续仍走防抖（常见于搜索）
 */

import React from 'react';
import { Input } from 'antd';
import { useDebouncedState } from 'tx-hooks';

export default () => {
  const [value, setValue, debouncedValue] = useDebouncedState('', {
    delay: 500,
    leading: true,
    skipInitial: true,
  });

  return (
    <div style={{ maxWidth: 400 }}>
      <Input
        placeholder="leading + skipInitial"
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

      <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
        第一次输入立即同步，后续输入仍会防抖
      </div>
    </div>
  );
};
