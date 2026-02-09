/**
 * title: 基础用法
 * description: 防重复点击（第一次立即执行，窗口期内拦截后续点击）
 */
import React, { useMemo, useState } from 'react';
import { Alert, Button, InputNumber, Space, Typography, message } from 'antd';
import { useDebouncedClick } from '@tx-labs/react-hooks';

export default function DemoUseBebouncedClickBasic() {
  const [delay, setDelay] = useState(500);
  const [count, setCount] = useState(0);

  const [onClick, { pending }] = useDebouncedClick(
    () => {
      setCount((c) => c + 1);
      message.success('点击已生效（窗口期内后续点击会被拦截）');
    },
    { delay },
  );

  const tip = useMemo(() => {
    return `第一次点击立即执行；之后 ${delay}ms 内点击会被拦截。`;
  }, [delay]);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert type="info" showIcon title={tip} />

      <Space align="center" size={12}>
        <Typography.Text>窗口期 delay：</Typography.Text>
        <InputNumber min={0} step={100} value={delay} onChange={(v) => setDelay(Number(v ?? 0))} />
        <Typography.Text type="secondary">ms</Typography.Text>
      </Space>

      <Space size={12}>
        <Button type="primary" onClick={onClick}>
          {pending ? '拦截中...' : '点击触发'}
        </Button>

        <Typography.Text type="secondary">pending：</Typography.Text>
        <Typography.Text>{pending ? 'true' : 'false'}</Typography.Text>

        <Typography.Text type="secondary">生效次数：</Typography.Text>
        <Typography.Text strong>{count}</Typography.Text>
      </Space>

      <Typography.Text type="secondary">
        快速连点按钮，生效次数只会在窗口期之外增长。
      </Typography.Text>
    </Space>
  );
}
