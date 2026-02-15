/**
 * title: 基础用法
 * description: 展示当前值与上一轮渲染值，并演示 shouldUpdate 控制“上一值”的记录时机
 */
import React, { useState } from 'react';
import { Button, Divider, Space, Switch, Typography } from 'antd';
import { usePrevious } from '@tx-labs/react-hooks';

export default function DemoUsePrevious() {
  const [count, setCount] = useState(0);
  const [onlyRecordEven, setOnlyRecordEven] = useState(false);

  // 默认：每次 value 变化都会更新“上一值”
  const prev = usePrevious(count);

  // 受控：开启“仅记录偶数”后，只在 next 为偶数时才更新上一值
  const prevRecorded = usePrevious(count, {
    initialValue: 0,
    shouldUpdate: (_prev, next) => {
      if (!onlyRecordEven) return true;
      return next % 2 === 0;
    },
  });

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Space wrap>
        <Button onClick={() => setCount((c) => c + 1)}>+1</Button>
        <Button onClick={() => setCount((c) => c - 1)}>-1</Button>
        <Button onClick={() => setCount((c) => c + 5)}>+5</Button>
        <Button onClick={() => setCount(Math.floor(Math.random() * 100))}>随机设置</Button>
      </Space>

      <Space align="center">
        <Switch checked={onlyRecordEven} onChange={setOnlyRecordEven} />
        <Typography.Text>仅记录偶数（通过 shouldUpdate 控制）</Typography.Text>
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Space orientation="vertical" size={6}>
        <Typography.Text>
          当前 count：<Typography.Text strong>{count}</Typography.Text>
        </Typography.Text>

        <Typography.Text>
          上一值（默认）：
          <Typography.Text code>{typeof prev === 'number' ? prev : '-'}</Typography.Text>
        </Typography.Text>

        <Typography.Text>
          上一次记录值（受 shouldUpdate 影响）：
          <Typography.Text code>
            {typeof prevRecorded === 'number' ? prevRecorded : '-'}
          </Typography.Text>
        </Typography.Text>

        <Typography.Text type="secondary">
          提示：开启“仅记录偶数”后，count
          变成奇数时不会更新记录，因此“上一次记录值”会停留在最近一次偶数。
        </Typography.Text>
      </Space>
    </Space>
  );
}
