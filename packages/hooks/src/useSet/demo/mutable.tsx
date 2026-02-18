/**
 * title: Mutable 模式
 * description: 面向大 Set 高频写入；引用通常不变，用 getVersion() 的结果表达“内容变化”
 */
import React, { useRef, useState } from 'react';
import { Button, Divider, Space, Statistic, Typography } from 'antd';
import { useSet } from '@tx-labs/react-hooks';

function buildValues(count: number, start = 0) {
  const arr = new Array<string>(count);
  for (let i = 0; i < count; i += 1) {
    arr[i] = `v-${start + i}`;
  }
  return arr;
}

export default function DemoUseSetMutableLarge() {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const set = useSet<string>([], { mode: 'mutable' });
  const version = set.getVersion();

  const [lastOpMs, setLastOpMs] = useState<number>(0);
  const [total, setTotal] = useState<number>(50000);

  // 记录最近一次初始化规模：用于稳定选择样本值
  const [activeTotal, setActiveTotal] = useState<number>(0);

  const { size } = set;
  const sampleSize = activeTotal > 0 ? activeTotal : size;
  const sampleValues =
    sampleSize > 0 ? [`v-0`, `v-1`, `v-${Math.floor(sampleSize / 2)}`, `v-${sampleSize - 1}`] : [];

  const sampleLines =
    size === 0
      ? '请先点击「初始化大数据（replace）」'
      : sampleValues.map((v) => `${v}: ${set.has(v) ? 'true' : 'false'}`).join('\n');

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        useSet（mutable - large）
      </Typography.Title>

      <Typography.Text type="secondary">
        这个 demo
        不渲染全量列表（避免把渲染成本混进来）。下面的样本值来自固定位置（头/中/尾），用于验证每次批量操作确实生效。
      </Typography.Text>

      <Space wrap>
        <Button
          type="primary"
          onClick={() => {
            const t0 = performance.now();
            set.replace(buildValues(total));
            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
            setActiveTotal(total);
          }}
        >
          初始化大数据（replace）
        </Button>

        <Button
          onClick={() => {
            if (set.size === 0) return;

            // 批量删除：删除前半段
            const t0 = performance.now();
            set.deleteAll(buildValues(Math.floor((activeTotal || set.size) / 2), 0));
            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
          }}
        >
          删除前半段（deleteAll）
        </Button>

        <Button
          onClick={() => {
            if (activeTotal <= 0) return;

            // 批量添加：把前半段加回去（幂等，重复点击不会无限增长）
            const t0 = performance.now();
            set.addAll(buildValues(Math.floor(activeTotal / 2), 0));
            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
          }}
        >
          加回前半段（addAll）
        </Button>

        <Button
          onClick={() => {
            const t0 = performance.now();
            set.clear();
            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
            setActiveTotal(0);
          }}
        >
          clear
        </Button>

        <Button
          onClick={() => {
            const t0 = performance.now();
            set.reset();
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
        <Statistic title="size" value={set.size} />
        <Statistic title="version（内容变化信号）" value={version} />
        <Statistic title="render count" value={renderCountRef.current} />
        <Statistic title="last op cost (ms)" value={lastOpMs} />
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Typography.Text strong>样本值（头/中/尾，value: has）：</Typography.Text>
      <Typography.Paragraph style={{ marginBottom: 0 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{sampleLines}</pre>
      </Typography.Paragraph>

      <Typography.Text type="secondary">
        说明：mutable 模式下 set 引用通常不变；需要用于 deps/memo 时，用 version（set.getVersion()
        的结果）表达“内容变化”。
      </Typography.Text>
    </Space>
  );
}
