/**
 * title: Mutable 模式
 * description: 面向大数组批量修改；引用通常不变，用 getVersion() 表达“内容变化”
 */
import React, { useRef, useState } from 'react';
import { Button, Divider, Space, Statistic, Typography } from 'antd';
import { useArray } from '@tx-labs/react-hooks';

function buildNumbers(count: number) {
  const out = new Array<number>(count);
  for (let i = 0; i < count; i += 1) out[i] = i;
  return out;
}

function sampleLines(arr: number[], total: number) {
  if (arr.length === 0) return '请先点击「初始化大数据（replace）」';
  const mid = Math.floor(total / 2);
  const last = total - 1;
  const keys = [0, 1, mid, last].filter((i) => i >= 0 && i < arr.length);

  return keys.map((i) => `${i}: ${String(arr[i])}`).join('\n');
}

export default function DemoUseArrayMutableLarge() {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const arr = useArray<number>([], { mode: 'mutable' });
  const version = arr.getVersion();

  const [total, setTotal] = useState<number>(50000);
  const [lastOpMs, setLastOpMs] = useState<number>(0);
  const [activeTotal, setActiveTotal] = useState<number>(0);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        useArray（mutable）
      </Typography.Title>

      <Typography.Text type="secondary">
        不渲染全量列表（避免把渲染成本混进来）。用固定样本索引观察批量修改是否生效；mutable
        下引用通常不变，用 version 表达变化。
      </Typography.Text>

      <Space wrap>
        <Button
          type="primary"
          onClick={() => {
            const t0 = performance.now();
            arr.replace(buildNumbers(total));
            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
            setActiveTotal(total);
          }}
        >
          初始化大数据（replace）
        </Button>

        <Button
          onClick={() => {
            if (arr.length === 0) return;
            const t0 = performance.now();
            arr.batch((draft) => {
              for (let i = 0; i < draft.length; i += 1) draft[i] += 1;
            });
            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
          }}
        >
          全量 +1（batch）
        </Button>

        <Button
          onClick={() => {
            if (arr.length === 0) return;
            const t0 = performance.now();
            arr.length = Math.trunc(arr.length / 2);
            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
          }}
        >
          截断为一半（length={Math.trunc(arr.length / 2)}）
        </Button>

        <Button
          onClick={() => {
            const t0 = performance.now();
            arr.length = 0;
            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
            setActiveTotal(0);
          }}
        >
          清空（length=0）
        </Button>

        <Button
          onClick={() => {
            const t0 = performance.now();
            arr.reset();
            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
            setActiveTotal(0);
          }}
        >
          reset
        </Button>
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Space wrap>
        <Button onClick={() => setTotal((v) => Math.max(1000, v - 10000))}>total -10000</Button>
        <Button onClick={() => setTotal((v) => v + 10000)}>total +10000</Button>
      </Space>

      <Space wrap>
        <Statistic title="total（初始化条目数）" value={total} />
        <Statistic title="length" value={arr.length} />
        <Statistic title="version（内容变化信号）" value={version} />
        <Statistic title="render count" value={renderCountRef.current} />
        <Statistic title="last op cost (ms)" value={lastOpMs} />
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Typography.Text strong>样本索引（index: value）：</Typography.Text>
      <Typography.Paragraph style={{ marginBottom: 0 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {sampleLines(arr, activeTotal > 0 ? activeTotal : arr.length)}
        </pre>
      </Typography.Paragraph>
    </Space>
  );
}
