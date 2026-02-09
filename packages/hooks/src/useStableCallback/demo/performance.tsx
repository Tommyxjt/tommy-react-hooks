/**
 * title: 性能提升（对比 useCallback）
 * description: 父子通信：useCallback 依赖 count 导致回调引用变化 → 子组件随之“有效重渲染”；useStableCallback 引用稳定 → 子组件在父更新时不渲染
 */
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Space, Statistic, Typography } from 'antd';
import { useStableCallback } from '@tx-labs/react-hooks';

type ReadFn = () => number;

const MemoizedChild = memo((props: { onRead: ReadFn }) => {
  const { onRead } = props;

  const [lastRead, setLastRead] = useState<number | null>(null);

  // “有效渲染次数（由 props 变化触发）”
  // 只在 onRead 引用真的变化时 +1。这样：
  // - stable 方案：onRead 引用不变，始终为 1
  // - useCallback 方案：onRead 随 count 变化，点击 +1 会持续增长
  const [effectiveRenders, setEffectiveRenders] = useState(1);
  const lastOnReadRef = useRef<ReadFn>(onRead);

  useEffect(() => {
    if (lastOnReadRef.current !== onRead) {
      lastOnReadRef.current = onRead;
      setEffectiveRenders((n) => n + 1);
    }
  }, [onRead]);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Space size={16} wrap>
        <Statistic title="Child render 次数" value={effectiveRenders} />
      </Space>

      <Button onClick={() => setLastRead(onRead())}>读取最新 count</Button>

      <Typography.Text type="secondary">最近一次读取：{lastRead ?? '-'}</Typography.Text>
    </Space>
  );
});

function Panel(props: { title: string; hint: string; onRead: ReadFn }) {
  const { title, hint, onRead } = props;

  return (
    <Card title={title} style={{ flex: 1, minWidth: 320 }}>
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Alert type="info" showIcon message={hint} />
        <MemoizedChild onRead={onRead} />
      </Space>
    </Card>
  );
}

export default function DemoPerformanceImprovement() {
  const [count, setCount] = useState(0);

  // 对照组：为了读到最新 count → 依赖 count → 引用每次变化
  const onReadUseCallback = useCallback(() => count, [count]);

  // 目标组：引用稳定，但内部读取最新 count
  const onReadStable = useStableCallback(() => count);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type="info"
        showIcon
        title="操作：反复点击 +1。你会看到 useCallback 那列 Child render 次数持续增加；useStableCallback 那列保持不变。两边“读取最新 count”都能读到最新值。"
      />

      <Button type="primary" onClick={() => setCount((n) => n + 1)}>
        +1（当前 count：{count}）
      </Button>

      <Space size={12} align="start" wrap style={{ width: '100%' }}>
        <Panel
          title="useCallback（引用随 count 变化）"
          hint="为了拿最新 count，依赖 count → onRead 引用变化 → memo 子组件会被迫更新"
          onRead={onReadUseCallback}
        />
        <Panel
          title="useStableCallback（引用稳定）"
          hint="onRead 引用稳定 → memo 子组件不会因父组件 count 更新而更新，但读取仍是最新"
          onRead={onReadStable}
        />
      </Space>
    </Space>
  );
}
