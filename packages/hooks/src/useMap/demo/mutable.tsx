/**
 * title: Mutable 模式
 * description: 面向大 Map 高频/批量写入；引用通常不变，用 getVersion() 的结果表达“内容变化”
 */
import React, { useMemo, useRef, useState } from 'react';
import { Button, Divider, Space, Statistic, Typography } from 'antd';
import { useMap } from '@tx-labs/react-hooks';

function buildEntries(count: number, start = 0): Array<readonly [string, number]> {
  const arr: Array<readonly [string, number]> = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const idx = start + i;
    arr[i] = [`k-${String(idx)}`, idx];
  }
  return arr;
}

function formatValue(v: unknown) {
  if (v === null) return 'null';
  if (v === undefined) return '-';
  return String(v);
}

export default function DemoUseMapMutableLarge() {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const map = useMap<string, number>([], { mode: 'mutable' });
  const version = map.getVersion();

  const [lastOpMs, setLastOpMs] = useState<number>(0);
  const [total, setTotal] = useState<number>(30000);

  // 记录最近一次 replace 初始化的规模：用于稳定选择样本 key（否则你改 total 会影响样本位置含义）
  const [activeTotal, setActiveTotal] = useState<number>(0);

  const sampleKeys = useMemo(() => {
    const size = activeTotal > 0 ? activeTotal : map.size;
    if (size <= 0) return [];

    // 样本固定取：第 1 个、第 2 个、中位、最后 1 个
    const a = 0;
    const b = Math.min(1, size - 1);
    const c = Math.floor(size / 2);
    const d = size - 1;
    return [`k-${String(a)}`, `k-${String(b)}`, `k-${String(c)}`, `k-${String(d)}`];
  }, [activeTotal, map.size]);

  const sampleLines = useMemo(() => {
    if (map.size === 0) return '请先点击「初始化大数据（replace）」';
    if (sampleKeys.length === 0) return '样本计算中...';

    return sampleKeys.map((k) => `${k}: ${formatValue(map.get(k))}`).join('\n');
  }, [sampleKeys, map]);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        useMap（mutable）
      </Typography.Title>

      <Typography.Text type="secondary">
        这个 demo 不渲染全量列表（那会把渲染成本混进来）。下面的“样本
        key”来自固定位置（头/中/尾），用于验证每次更新确实生效： 点击「全量 +1」后，样本行里的 value
        应该每次都整体 +1。
      </Typography.Text>

      <Space wrap>
        <Button
          type="primary"
          onClick={() => {
            const t0 = performance.now();
            map.replace(buildEntries(total));
            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
            setActiveTotal(total);
          }}
        >
          初始化大数据（replace）
        </Button>

        <Button
          onClick={() => {
            if (map.size === 0) return;

            // 全量函数式更新：基于当前 value 做 +1（点多次也一直累加）
            const t0 = performance.now();

            const nextEntries: Array<readonly [string, number]> = [];
            for (const [k, v] of map.entries()) {
              const current = typeof v === 'number' ? v : 0;
              nextEntries.push([k, current + 1] as const);
            }

            map.batchSet(nextEntries);

            const t1 = performance.now();
            setLastOpMs(Number((t1 - t0).toFixed(2)));
          }}
        >
          全量 +1（batchSet）
        </Button>

        <Button
          onClick={() => {
            const t0 = performance.now();
            map.clear();
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
            map.reset();
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
        <Button onClick={() => setTotal((v) => Math.max(1000, v - 5000))}>total -5000</Button>
        <Button onClick={() => setTotal((v) => v + 5000)}>total +5000</Button>
      </Space>

      <Space wrap>
        <Statistic title="total（初始化条目数）" value={total} />
        <Statistic title="size" value={map.size} />
        <Statistic title="version（内容变化信号）" value={version} />
        <Statistic title="render count" value={renderCountRef.current} />
        <Statistic title="last op cost (ms)" value={lastOpMs} />
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Typography.Text strong>样本 key（头/中/尾，key: value）：</Typography.Text>
      <Typography.Paragraph style={{ marginBottom: 0 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{sampleLines}</pre>
      </Typography.Paragraph>

      <Typography.Text type="secondary">
        说明：mutable 模式下 map 引用通常不变；需要用于 deps/memo 时，用 version（map.getVersion()
        的结果）表达“内容变化”。
      </Typography.Text>
    </Space>
  );
}
