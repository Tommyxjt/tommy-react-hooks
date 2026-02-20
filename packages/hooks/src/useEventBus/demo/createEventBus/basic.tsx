/**
 * title: 基础用法
 * description: 演示 on / once / off / emit / clear / listenerCount 的基础行为（含 once 重复注册忽略）
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Button, Divider, Space, Statistic, Typography } from 'antd';
import { createEventBus } from '@tx-labs/react-hooks';

interface DemoEvents {
  ping: { from: string; at: number };
  notice: string;
}

const bus = createEventBus<DemoEvents>({
  debugName: 'demo-basic',
  maxListeners: 5,
});

export default function DemoCreateEventBusBasic() {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const [logs, setLogs] = useState<string[]>([]);
  const [subscribed, setSubscribed] = useState(false);

  const onPingRef = useRef<null | (() => void)>(null);
  const onceNoticeRef = useRef<null | (() => void)>(null);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 30));
  }, []);

  // 稳定引用：用于演示 once 重复注册忽略
  const noticeOnceHandler = useCallback(
    (text: string) => {
      appendLog(`[once:notice]事件的订阅回调触发  ${text}`);
    },
    [appendLog],
  );

  const registerOn = () => {
    if (onPingRef.current) return;

    const handler = (payload: DemoEvents['ping']) => {
      appendLog(`[on:ping]事件的订阅回调触发 from=${payload.from}`);
    };

    onPingRef.current = bus.on('ping', handler);
    setSubscribed(true);
    appendLog('注册 on(ping)');
  };

  const unregisterOn = () => {
    onPingRef.current?.();
    onPingRef.current = null;
    setSubscribed(false);
    appendLog('取消 on(ping)');
  };

  const registerOnce = () => {
    // 连续两次注册同一个函数引用：第二次会被忽略（no-op）
    const unsubscribe = bus.once('notice', noticeOnceHandler);
    bus.once('notice', noticeOnceHandler);

    onceNoticeRef.current = unsubscribe;
    appendLog('注册 once(notice)（重复注册同一 cb 会被忽略）');
  };

  const emitPing = () => {
    appendLog('emit(ping)');
    bus.emit('ping', { from: 'button', at: Date.now() });
  };

  const emitNotice = () => {
    appendLog('emit(notice)');
    bus.emit('notice', `hello-${Math.random().toString(16).slice(2, 6)}`);
  };

  const cancelOnceBeforeEmit = () => {
    onceNoticeRef.current?.();
    onceNoticeRef.current = null;
    appendLog('提前取消 once(notice)');
  };

  const clearNotice = () => {
    bus.clear('notice');
    appendLog('clear(notice)');
  };

  const clearAll = () => {
    bus.clear();
    onPingRef.current = null;
    onceNoticeRef.current = null;
    setSubscribed(false);
    appendLog('clear(all)');
  };

  const stats = useMemo(
    () => ({
      pingCount: bus.listenerCount('ping'),
      noticeCount: bus.listenerCount('notice'),
      totalCount: bus.listenerCount(),
    }),
    [logs],
  );

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        createEventBus（基础用法）
      </Typography.Title>

      <Typography.Text type="secondary">
        演示同步派发、once 自动移除、重复注册忽略，以及 listenerCount / clear 的行为。
      </Typography.Text>

      <Alert
        showIcon
        type="warning"
        title="注意：EventBus 的 “去重” 判断依据是 “函数引用相等”，需要使用者手动维护"
      />

      <Space wrap>
        <Button type="primary" onClick={registerOn} disabled={!!onPingRef.current}>
          注册 on(ping)
        </Button>
        <Button onClick={unregisterOn} disabled={!onPingRef.current}>
          取消 on(ping)
        </Button>

        <Button onClick={registerOnce}>注册 once(notice)</Button>
        <Button onClick={cancelOnceBeforeEmit}>提前取消 once</Button>

        <Button onClick={emitPing}>emit(ping)</Button>
        <Button onClick={emitNotice}>emit(notice)</Button>

        <Button onClick={clearNotice}>clear(notice)</Button>
        <Button danger onClick={clearAll}>
          clear(all)
        </Button>
        <Button danger onClick={clearLogs}>
          清空日志
        </Button>
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Space wrap>
        <Statistic title="ping listeners" value={stats.pingCount} />
        <Statistic title="notice listeners" value={stats.noticeCount} />
        <Statistic title="total listeners" value={stats.totalCount} />
        <Statistic title="render count" value={renderCountRef.current} />
        <Statistic title="on(ping) subscribed" value={subscribed ? 'yes' : 'no'} />
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <Typography.Text strong>日志（最近 30 条）</Typography.Text>
      <Typography.Paragraph style={{ marginBottom: 0 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {logs.length ? logs.join('\n') : '(empty)'}
        </pre>
      </Typography.Paragraph>
    </Space>
  );
}
