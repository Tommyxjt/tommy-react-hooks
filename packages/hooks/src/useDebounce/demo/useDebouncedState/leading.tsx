/**
 * title: leading 场景
 * description: 一轮输入开始时立即产出一次 debouncedState（更快展示），停下来后再产出最终稳定值
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Flex, Input, Space, Switch, Typography } from 'antd';
import { useBoolean, useDebouncedState } from '@tx-labs/react-hooks';

export default function DemoLeading() {
  const [leading, { toggle: toggleLeading }] = useBoolean(true);

  const [text, setText, controls] = useDebouncedState<string>('', { delay: 600, leading });
  const { debouncedState, pending } = controls;

  const [times, setTimes] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const tip = useMemo(() => {
    return leading
      ? 'leading=true：开始输入时会先立即产出一次 debouncedState；停止输入后，再产出最终稳定值'
      : 'leading=false：只会在停止输入一段时间后产出 debouncedState';
  }, [leading]);

  useEffect(() => {
    // 记录 debouncedState 的变化
    if (debouncedState === '') return;
    setTimes((t) => t + 1);
    setLogs((prev) => [
      `${new Date().toLocaleTimeString()} 触发：debouncedState="${debouncedState}"`,
      ...prev,
    ]);
  }, [debouncedState]);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert type="info" showIcon title={tip} />

      <Space align="center" size={12}>
        <Typography.Text>leading</Typography.Text>
        <Switch checked={leading} onChange={toggleLeading} />

        <Typography.Text type="secondary">delay：</Typography.Text>
        <Typography.Text>600ms</Typography.Text>
      </Space>

      <Input
        placeholder="快速输入，观察 debouncedState 的触发时机"
        value={text}
        onChange={(e) => setText(e.target.value)}
        allowClear
      />

      <Flex gap="middle">
        <div>
          <Typography.Text type="secondary">pending：</Typography.Text>
          <Typography.Text>{pending ? 'true' : 'false'}</Typography.Text>
        </div>

        <div>
          <Typography.Text type="secondary">debouncedState：</Typography.Text>
          <Typography.Text strong>{debouncedState || '-'}</Typography.Text>
        </div>

        <div>
          <Typography.Text type="secondary">触发次数：</Typography.Text>
          <Typography.Text strong>{times}</Typography.Text>
        </div>
      </Flex>

      <div
        style={{
          maxHeight: 180,
          overflow: 'auto',
          padding: 12,
          border: '1px solid #f0f0f0',
          borderRadius: 6,
        }}
      >
        {logs.length ? (
          logs.map((x) => (
            <Typography.Paragraph key={x} style={{ marginBottom: 6 }}>
              {x}
            </Typography.Paragraph>
          ))
        ) : (
          <Typography.Text type="secondary">暂无日志</Typography.Text>
        )}
      </div>
    </Space>
  );
}
