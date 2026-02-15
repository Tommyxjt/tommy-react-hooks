/**
 * title: Immutable 模式
 * description: 通过输入 key/value 来 set 或 delete，直观体验引用变化带来的 deps/memo 语义
 */
import React, { useMemo, useRef, useState } from 'react';
import { Button, Divider, Input, Space, Statistic, Typography } from 'antd';
import { useMap } from '@tx-labs/react-hooks';

function formatValue(v: unknown) {
  if (v === null) return 'null';
  if (v === undefined) return '-';
  return String(v);
}

function randomText() {
  return Math.random().toString(16).slice(2, 8);
}

export default function DemoUseMapImmutable() {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const map = useMap<string, string>([
    ['a', 'apple'],
    ['b', 'banana'],
    ['c', 'cherry'],
  ]);

  const [key, setKey] = useState('a');
  const [value, setValue] = useState('apple');

  // immutable：map 引用变化表达“内容变化”，因此展示/派生依赖 map 本身即可
  const lines = useMemo(() => {
    const list = Array.from(map.entries()).slice(0, 30);
    if (list.length === 0) return '(empty)';
    return list.map(([k, v]) => `${k}: ${formatValue(v)}`).join('\n');
  }, [map]);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        useMap（immutable）
      </Typography.Title>

      <Typography.Text type="secondary">
        输入 key/value（字符串）后点击 set 或 delete。immutable
        模式下每次真实变更都会产生新引用，因此可以自然用于 deps/memo/props 比较语义。
      </Typography.Text>

      <Space wrap align="center">
        <Input
          style={{ width: 220 }}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="key（例如 a）"
          allowClear
        />
        <Input
          style={{ width: 260 }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value（字符串）"
          allowClear
        />

        <Button
          type="primary"
          onClick={() => {
            const k = (key || '').trim();
            if (!k) return;
            map.set(k, value);
          }}
        >
          set / update
        </Button>

        <Button
          onClick={() => {
            const k = (key || '').trim();
            if (!k) return;
            map.delete(k);
          }}
        >
          delete
        </Button>

        <Button
          onClick={() => {
            const k = (key || '').trim() || 'new-key';
            setKey(k);
            const v = `v-${randomText()}`;
            setValue(v);
            map.set(k, v);
          }}
        >
          set 随机 value
        </Button>

        <Button
          onClick={() => {
            map.batchSet([
              ['x', `x-${randomText()}`],
              ['y', `y-${randomText()}`],
              ['z', `z-${randomText()}`],
            ]);
          }}
        >
          batchSet 示例
        </Button>

        <Button
          onClick={() => {
            map.replace([
              ['only', 'kept-1'],
              ['kept', 'kept-2'],
            ]);
          }}
        >
          replace 示例
        </Button>

        <Button onClick={() => map.reset()}>reset</Button>
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Space wrap>
        <Statistic title="size" value={map.size} />
        <Statistic title="render count" value={renderCountRef.current} />
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Typography.Text strong>当前 Map（最多 30 条，key: value）：</Typography.Text>
      <Typography.Paragraph style={{ marginBottom: 0 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{lines}</pre>
      </Typography.Paragraph>
    </Space>
  );
}
