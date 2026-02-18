/**
 * title: Immutable 模式
 * description: 输入 value（字符串）后 add / delete；每次真实变更都会产生新引用，适合作为 deps/memo 比较语义
 */
import React, { useMemo, useRef, useState } from 'react';
import { Button, Divider, Input, Space, Statistic, Typography } from 'antd';
import { useSet } from '@tx-labs/react-hooks';

function randomText() {
  return Math.random().toString(16).slice(2, 8);
}

export default function DemoUseSetImmutable() {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const set = useSet<string>(['apple', 'banana', 'cherry']);

  const [value, setValue] = useState('apple');

  const preview = useMemo(() => {
    const list = Array.from(set.values()).slice(0, 30);
    if (list.length === 0) return '(empty)';
    return list.join('\n');
  }, [set]);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        useSet（immutable）
      </Typography.Title>

      <Typography.Text type="secondary">
        输入 value（字符串）后点击 add / delete。immutable
        模式下引用随内容变化而变化，因此可以自然用于 deps/memo/props 比较语义。
      </Typography.Text>

      <Space wrap align="center">
        <Input
          style={{ width: 280 }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value（例如 apple）"
          allowClear
        />

        <Button
          type="primary"
          onClick={() => {
            const v = (value || '').trim();
            if (!v) return;
            set.add(v);
          }}
        >
          add
        </Button>

        <Button
          onClick={() => {
            const v = (value || '').trim();
            if (!v) return;
            set.delete(v);
          }}
        >
          delete
        </Button>

        <Button
          onClick={() => {
            const v = (value || '').trim() || 'new-value';
            const next = `${v}-${randomText()}`;
            setValue(next);
            set.add(next);
          }}
        >
          add 随机后缀
        </Button>

        <Button onClick={() => set.addAll(['x', 'y', 'z'].map((s) => `${s}-${randomText()}`))}>
          addAll 示例
        </Button>
        <Button onClick={() => set.replace(['only', 'kept'])}>replace 示例</Button>
        <Button onClick={() => set.reset()}>reset</Button>
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Space wrap>
        <Statistic title="size" value={set.size} />
        <Statistic title="render count" value={renderCountRef.current} />
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Typography.Text strong>当前 Set（最多 30 条，一行一个 value）：</Typography.Text>
      <Typography.Paragraph style={{ marginBottom: 0 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{preview}</pre>
      </Typography.Paragraph>
    </Space>
  );
}
