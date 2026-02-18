/**
 * title: Immutable 模式
 * description: 演示 arr[index] = value、arr.length = 0、delete arr[index] 以及常见变更方法
 */
import React, { useRef, useState } from 'react';
import { Button, Divider, Input, InputNumber, Space, Statistic, Typography } from 'antd';
import { useArray } from '@tx-labs/react-hooks';

function viewLines(arr: any[], max = 20) {
  const lines: string[] = [];
  const n = Math.min(arr.length, max);
  for (let i = 0; i < n; i += 1) {
    if (i in arr) lines.push(`${i}: ${String(arr[i])}`);
    else lines.push(`${i}: <hole>`);
  }
  if (arr.length > max) lines.push(`... (length=${arr.length})`);
  if (arr.length === 0) return '(empty)';
  return lines.join('\n');
}

export default function DemoUseArrayImmutable() {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const arr = useArray<string>(['apple', 'banana', 'cherry']);

  const [index, setIndex] = useState<number>(0);
  const [value, setValue] = useState<string>('apple');

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        useArray（immutable）
      </Typography.Title>

      <Typography.Text type="secondary">
        直接写 arr[index] / arr.length、以及 delete arr[index] 都会触发更新。hole 会显示为
        &lt;hole&gt;。
      </Typography.Text>

      <Space wrap align="center">
        <InputNumber
          style={{ width: 160 }}
          value={index}
          onChange={(v) => setIndex(typeof v === 'number' ? v : 0)}
          placeholder="index"
        />
        <Input
          style={{ width: 260 }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value"
          allowClear
        />

        <Button
          type="primary"
          onClick={() => {
            arr[index] = value;
          }}
        >
          arr[index] = value
        </Button>

        <Button
          onClick={() => {
            delete arr[index];
          }}
        >
          delete arr[index]
        </Button>

        <Button
          onClick={() => {
            arr.push(value || 'x');
          }}
        >
          push
        </Button>

        <Button
          onClick={() => {
            arr.unshift(value || 'x');
          }}
        >
          unshift
        </Button>

        <Button
          onClick={() => {
            arr.splice(index, 0, value || 'x');
          }}
        >
          splice insert
        </Button>

        <Button
          onClick={() => {
            arr.length = 0;
          }}
        >
          arr.length = 0
        </Button>
        <Button onClick={() => arr.reset()}>reset</Button>
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Space wrap>
        <Statistic title="length" value={arr.length} />
        <Statistic title="render count" value={renderCountRef.current} />
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Typography.Text strong>预览（最多 20 行）：</Typography.Text>
      <Typography.Paragraph style={{ marginBottom: 0 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{viewLines(arr)}</pre>
      </Typography.Paragraph>
    </Space>
  );
}
