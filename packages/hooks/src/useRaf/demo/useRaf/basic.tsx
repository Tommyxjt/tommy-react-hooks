/**
 * title: 基础使用
 * description: 调用 raf(next) 会把更新合并到下一帧执行；同一帧内多次调用只会以最后一次为准（takeLatest）。
 */
import React from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import { useRaf } from '@tx-labs/react-hooks';

export default function DemoUseRafBasicLight() {
  const [value, setValue] = React.useState(0);

  const raf = useRaf((next: number) => {
    setValue(next);
  });

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Space align="center">
        <Typography.Text>value：</Typography.Text>
        <Tag>{value}</Tag>
        <Typography.Text type="secondary">（下一帧提交）</Typography.Text>
      </Space>

      <Space wrap>
        <Button onClick={() => raf(value + 1)}>+1（下一帧）</Button>
      </Space>
    </Space>
  );
}
