/**
 * title: createEventBus + useEventBus（兄弟组件通信）
 * description: 父组件创建并稳定 bus；左侧发事件，右侧通过 useEventBus 接入并订阅显示消息
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Divider, Space, Statistic, Tag, Typography } from 'antd';
import { createEventBus, useEventBus } from '@tx-labs/react-hooks';

type NoticeLevel = 'info' | 'success' | 'warning';

interface DemoEvents {
  notice: {
    level: NoticeLevel;
    text: string;
    at: number;
  };
  clearNotices: undefined;
}

type DemoBus = ReturnType<typeof createEventBus<DemoEvents>>;

function randomText() {
  return Math.random().toString(16).slice(2, 8);
}

function levelTagColor(level: NoticeLevel) {
  if (level === 'success') return 'green';
  if (level === 'warning') return 'orange';
  return 'blue';
}

function ActionPanel({ bus, onAfterBusOp }: { bus: DemoBus; onAfterBusOp: () => void }) {
  const emitNotice = (level: NoticeLevel, text: string) => {
    bus.emit('notice', {
      level,
      text,
      at: Date.now(),
    });
    onAfterBusOp(); // 仅用于 demo 刷新观测信息（listenerCount / 状态提示）
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={8}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        操作面板（发送方）
      </Typography.Title>

      <Typography.Text type="secondary">
        这里不订阅事件，只负责 <code>emit</code>。用它来模拟“兄弟组件/不同区域”之间的消息通信。
      </Typography.Text>

      <Space wrap>
        <Button type="primary" onClick={() => emitNotice('info', `普通通知 ${randomText()}`)}>
          发送普通通知
        </Button>

        <Button onClick={() => emitNotice('success', `保存成功 ${randomText()}`)}>
          发送成功通知
        </Button>

        <Button danger onClick={() => emitNotice('warning', `风险提醒 ${randomText()}`)}>
          发送警告通知
        </Button>

        <Button
          onClick={() => {
            bus.emit('clearNotices', undefined);
            onAfterBusOp();
          }}
        >
          清空消息（emit）
        </Button>

        <Button
          danger
          onClick={() => {
            bus.clear();
            onAfterBusOp();
          }}
        >
          clear(all 监听)
        </Button>
      </Space>

      <Typography.Text type="secondary">
        注意：<code>clear(all)</code> 会把消息面板自己的订阅也清掉；此后按钮仍能
        emit，但不会再有消息显示，需“重挂载消息面板”恢复订阅。
      </Typography.Text>
    </Space>
  );
}

function NoticePanel({
  bus,
  debugTick,
  onSubscriptionChanged,
}: {
  bus: DemoBus;
  debugTick: number;
  onSubscriptionChanged: () => void;
}) {
  const eventBus = useEventBus(bus);
  const [notices, setNotices] = useState<Array<DemoEvents['notice']>>([]);
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => {
    const offNotice = eventBus.on('notice', (payload) => {
      setNotices((prev) => [payload, ...prev].slice(0, 8));
    });

    const offClear = eventBus.on('clearNotices', () => {
      setNotices([]);
    });

    // 告诉父组件：订阅已建立（用于刷新 listenerCount 展示）
    onSubscriptionChanged();

    return () => {
      offNotice();
      offClear();
      // 告诉父组件：订阅已清理（用于刷新 listenerCount 展示）
      onSubscriptionChanged();
    };
  }, [eventBus, onSubscriptionChanged]);

  // 仅用于让 demo 在 bus 外部状态变化时有可观测刷新（如 clear(all)）
  const _demoTick = debugTick;

  const noticeListenerCount = eventBus.listenerCount('notice');
  const clearListenerCount = eventBus.listenerCount('clearNotices');
  const subscriptionsAlive = noticeListenerCount > 0 && clearListenerCount > 0;

  const lines = useMemo(() => {
    if (notices.length === 0) return ['(暂无消息)'];
    return notices.map((n) => `${new Date(n.at).toLocaleTimeString()} [${n.level}] ${n.text}`);
  }, [notices]);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={8}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        消息面板（订阅方）
      </Typography.Title>

      <Typography.Text type="secondary">
        通过 <code>useEventBus(bus)</code> 接入实例，再在 effect 中订阅 <code>notice</code> /{' '}
        <code>clearNotices</code>。
      </Typography.Text>

      {!subscriptionsAlive && (
        <Typography.Text type="warning">
          当前订阅已不存在（通常是点了 clear(all)）。请点击上方“重挂载消息面板”恢复订阅。
        </Typography.Text>
      )}

      <Space wrap>
        <Statistic title="面板 render 次数" value={renderCountRef.current} />
        <Statistic title="当前消息数" value={notices.length} />
        <Statistic title="notice listeners" value={noticeListenerCount} />
        <Statistic title="clear listeners" value={clearListenerCount} />
        <Statistic title="demo tick" value={_demoTick} />
      </Space>

      <div
        style={{
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 12,
          background: '#fafafa',
        }}
      >
        <Space orientation="vertical" size={6} style={{ width: '100%' }}>
          {notices.length === 0 ? (
            <Typography.Text type="secondary">(暂无消息)</Typography.Text>
          ) : (
            notices.map((n, idx) => (
              <Space key={`${n.at}-${idx}`} wrap>
                <Tag color={levelTagColor(n.level)}>{n.level}</Tag>
                <Typography.Text>{n.text}</Typography.Text>
              </Space>
            ))
          )}
        </Space>
      </div>

      <Typography.Paragraph style={{ marginBottom: 0 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{lines.join('\n')}</pre>
      </Typography.Paragraph>
    </Space>
  );
}

export default function DemoUseEventBusBasic() {
  const parentRenderCountRef = useRef(0);
  parentRenderCountRef.current += 1;

  // 由“拥有者”负责稳定实例（推荐）
  const busRef = useRef<DemoBus | null>(null);
  const busCreateCountRef = useRef(0);

  if (!busRef.current) {
    busRef.current = createEventBus<DemoEvents>({
      debugName: 'demo-useEventBus',
      maxListeners: 10,
    });
    busCreateCountRef.current += 1;
  }

  const bus = busRef.current;

  // 用于证明“父组件 rerender 时 bus 不会重建”
  const firstBusRef = useRef<DemoBus | null>(null);
  if (!firstBusRef.current) {
    firstBusRef.current = bus;
  }
  const isSameBusInstance = firstBusRef.current === bus;

  // 仅用于 demo 观测刷新（不是业务必需）
  const [debugTick, setDebugTick] = useState(0);
  const bumpDebugTick = useCallback(() => {
    setDebugTick((n) => n + 1);
  }, []);

  const [showPanel, setShowPanel] = useState(true);
  const [manualRerenders, setManualRerenders] = useState(0);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        useEventBus（createEventBus + React 接入）
      </Typography.Title>

      <Typography.Text type="secondary">
        父组件创建并稳定 bus；操作面板发送事件；消息面板通过 <code>useEventBus(bus)</code>{' '}
        接入并订阅。 这个示例重点展示“跨组件通信”和“React 接入边界”。
      </Typography.Text>

      <Space wrap>
        <Button
          onClick={() => {
            setManualRerenders((n) => n + 1);
          }}
        >
          触发父组件 rerender（bus 不重建）
        </Button>

        <Button
          onClick={() => {
            setShowPanel((v) => !v);
          }}
        >
          {showPanel ? '卸载消息面板' : '重挂载消息面板'}
        </Button>
      </Space>

      <Space wrap>
        <Statistic title="父组件 render 次数" value={parentRenderCountRef.current} />
        <Statistic title="手动 rerender 次数" value={manualRerenders} />
        <Statistic title="bus 创建次数" value={busCreateCountRef.current} />
        <Statistic title="bus 引用是否稳定" value={isSameBusInstance ? 'yes' : 'no'} />
        <Statistic title="bus 总监听数" value={bus.listenerCount()} />
      </Space>

      <Divider style={{ margin: '8px 0' }} />

      <ActionPanel bus={bus} onAfterBusOp={bumpDebugTick} />

      <Divider style={{ margin: '8px 0' }} />

      {showPanel ? (
        <NoticePanel bus={bus} debugTick={debugTick} onSubscriptionChanged={bumpDebugTick} />
      ) : (
        <Typography.Text type="secondary">
          消息面板已卸载。此时总监听数应回落到 0（因为子组件 effect cleanup 已执行）。
        </Typography.Text>
      )}
    </Space>
  );
}
