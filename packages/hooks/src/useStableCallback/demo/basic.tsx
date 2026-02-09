/**
 * title: 基础用法
 * description: 闭包陷阱对照 —— 普通函数订阅一次会读到旧值；useStableCallback 在不重订阅的前提下读到最新值
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Typography } from 'antd';
import { useStableCallback } from '@tx-labs/react-hooks';

function dispatchEmit() {
  window.dispatchEvent(new Event('demo:emit'));
}

function NaiveCard({ count }: { count: number }) {
  const [seen, setSeen] = useState<number | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- demo: 刻意演示闭包陷阱
  useEffect(() => {
    // ⚠️ 典型闭包陷阱：订阅只注册一次（[]），回调里读到的是首次渲染时的 count
    const onEmit = () => setSeen(count);

    window.addEventListener('demo:emit', onEmit);
    return () => window.removeEventListener('demo:emit', onEmit);
  }, []);

  return (
    <Card title="普通函数（闭包陷阱）" style={{ flex: 1, minWidth: 320 }}>
      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
        <Alert
          type="warning"
          showIcon
          title="订阅只注册一次，回调捕获了初始 count，后续触发仍会读到旧值"
        />
        <Typography.Text>事件回调看到的 count：{seen ?? '-'}</Typography.Text>
      </Space>
    </Card>
  );
}

function StableCard({ count }: { count: number }) {
  const [seen, setSeen] = useState<number | null>(null);

  // 这里对比普通函数可以看到，仅仅只需要包一层 useStableCallback
  const onEmit = useStableCallback(() => {
    // 始终读取最新 count
    setSeen(count);
  });

  useEffect(() => {
    // 订阅只注册一次也没问题：onEmit 引用稳定，但内部逻辑始终获取最新 state

    window.addEventListener('demo:emit', onEmit);
    return () => window.removeEventListener('demo:emit', onEmit);
  }, [onEmit]); // 这里写 [onEmit] 是最规范的；onEmit 引用稳定，所以效果等同于只订阅一次

  return (
    <Card title="useStableCallback（最新逻辑）" style={{ flex: 1, minWidth: 320 }}>
      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
        <Alert
          type="success"
          showIcon
          title="订阅无需重绑，回调仍能读取最新 count（引用稳定 + 逻辑最新）"
        />
        <Typography.Text>事件回调看到的 count：{seen ?? '-'}</Typography.Text>
      </Space>
    </Card>
  );
}

export default function DemoUseStableCallbackBasic() {
  const [count, setCount] = useState(0);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type="info"
        showIcon
        title="操作：先点“+1”几次，再点“触发事件”。左边会卡在旧值，右边始终是最新值。"
      />

      <Space size={12} wrap>
        <Button type="primary" onClick={() => setCount((n) => n + 1)}>
          +1（当前：{count}）
        </Button>
        <Button onClick={dispatchEmit}>触发事件</Button>
      </Space>

      <Space size={12} align="start" wrap style={{ width: '100%' }}>
        <NaiveCard count={count} />
        <StableCard count={count} />
      </Space>
    </Space>
  );
}
