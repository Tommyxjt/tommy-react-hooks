/**
 * title: Slow Frame Mode（Timeout）+ takeLatest 同帧合并实验
 * description: 用 TimeoutDriver 把“帧”放慢，直观看到同一帧内多次 schedule 只会执行最后一次（takeLatest）；可切回真实 rAF 验证语义一致但更难观察。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Divider, Flex, InputNumber, List, Space, Switch, Tag, Typography } from 'antd';
import { useRafScheduler, createFrameDriver, createTimeoutDriver } from '@tx-labs/react-hooks';

interface Payload {
  seq: number;
  label: string;
  scheduledAt: number;
}

interface ScheduleEvent {
  seq: number;
  label: string;
  at: number;
}

interface InvokeEvent {
  invokedSeq: number;
  invokedLabel: string;
  reason: 'frame' | 'flush';
  at: number;
  frameTime?: number;
  cost?: number;
  mergedCountInFrame: number;
}

export default function Basic() {
  // —— Mode: 慢帧（timeout）/ 真 rAF ——
  const [useSlowTimeout, setUseSlowTimeout] = useState(true);
  const [timeoutDelay, setTimeoutDelay] = useState<number>(3000);

  // —— “同帧合并 takeLatest” 可观察实验参数 ——
  const [burstCount, setBurstCount] = useState<number>(8);

  // —— 自动狂点：让每一帧里出现多次 schedule，更容易看到 takeLatest ——
  const [autoSpam, setAutoSpam] = useState(false);
  const [spamEveryMs, setSpamEveryMs] = useState<number>(20);

  // —— 事件日志：schedule 多次 vs invoke 一次 ——
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [invokeEvents, setInvokeEvents] = useState<InvokeEvent[]>([]);

  // 全局递增序号（每次 schedule +1）
  const seqRef = useRef(0);

  // 统计“本帧窗口内 schedule 次数”，在 invoke 时落盘并清零
  const mergedCountInFrameRef = useRef(0);

  // —— drivers ——
  const slowDriver = useMemo(() => {
    return createTimeoutDriver({
      delay: Math.max(0, timeoutDelay),
      type: `timeout-${timeoutDelay}ms`,
    });
  }, [timeoutDelay]);

  const rafDriver = useMemo(() => {
    // 默认会优先选择 raf；fallbackDelay 这里无所谓（有 raf 时不会用到）
    return createFrameDriver({ fallback: 'timeout', fallbackDelay: 16 });
  }, []);

  const activeDriver = useSlowTimeout ? slowDriver : rafDriver;

  const scheduler = useRafScheduler<Payload>(
    (payload, meta) => {
      // tick 到来：takeLatest 的“最后一次 payload”会在这里出现
      const mergedCount = mergedCountInFrameRef.current;
      mergedCountInFrameRef.current = 0;

      setInvokeEvents((prev) => {
        const next: InvokeEvent = {
          invokedSeq: payload.seq,
          invokedLabel: payload.label,
          reason: meta.reason,
          at: meta.at,
          frameTime: meta.frameTime,
          cost: meta.cost,
          mergedCountInFrame: mergedCount,
        };
        return [next, ...prev].slice(0, 80);
      });
    },
    {
      driver: activeDriver,
      monitor: true,
      warnThresholdMs: 16.6,
      // 默认 takeLatest；这里显式写出来更直观
      merge: (_, next) => next,
    },
  );

  // driver 切换/延迟变化时，避免“旧 driver 的 pending tick”干扰观察
  useEffect(() => {
    scheduler.cancel();
    // 同时清空“本帧 schedule 计数器”，避免跨模式串帧
    mergedCountInFrameRef.current = 0;
  }, [useSlowTimeout, timeoutDelay]); // eslint-disable-line react-hooks/exhaustive-deps

  const logSchedule = (seq: number, label: string, at: number) => {
    setScheduleEvents((prev) => {
      const next: ScheduleEvent = { seq, label, at };
      return [next, ...prev];
    });
  };

  const scheduleOnce = (label: string) => {
    seqRef.current += 1;
    const seq = seqRef.current;

    const at = activeDriver.now();
    mergedCountInFrameRef.current += 1;

    logSchedule(seq, label, at);
    scheduler.schedule({ seq, label, scheduledAt: at });
  };

  const burstScheduleSameTick = () => {
    // 同一事件处理函数内连续 schedule：必然落在同一帧窗口里（下一帧才执行）
    for (let i = 1; i <= Math.max(1, burstCount); i += 1) {
      scheduleOnce(`burst-${i}`);
    }
  };

  // Auto spam：让一个“慢帧窗口”里堆很多次 schedule，更明显看到 takeLatest
  useEffect(() => {
    if (!autoSpam) return;

    const id = window.setInterval(() => {
      scheduleOnce('auto');
    }, Math.max(5, spamEveryMs));

    return () => window.clearInterval(id);
  }, [autoSpam, spamEveryMs, useSlowTimeout, timeoutDelay]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearLogs = () => {
    setScheduleEvents([]);
    setInvokeEvents([]);
    mergedCountInFrameRef.current = 0;
  };

  const mergedRatio =
    scheduleEvents.length > 0 ? `${invokeEvents.length}/${scheduleEvents.length}` : '-';

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={14}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        useRafScheduler：Slow Frame Mode + 同帧 takeLatest 合并实验
      </Typography.Title>

      <Flex gap={12} wrap="wrap" align="center">
        <Space>
          <Typography.Text strong>Driver 模式：</Typography.Text>
          <Switch
            checkedChildren="Timeout(慢帧)"
            unCheckedChildren="真实 rAF"
            checked={useSlowTimeout}
            onChange={setUseSlowTimeout}
          />
          <Tag color={useSlowTimeout ? 'blue' : 'green'}>
            {useSlowTimeout ? `timeout ~${timeoutDelay}ms` : 'rAF (fast)'}
          </Tag>
        </Space>

        {useSlowTimeout && (
          <Space>
            <Typography.Text>delay(ms)</Typography.Text>
            <InputNumber
              min={0}
              step={20}
              value={timeoutDelay}
              onChange={(v) => setTimeoutDelay(Number(v ?? 0))}
            />
          </Space>
        )}

        <Space>
          <Typography.Text>pending</Typography.Text>
          <Tag color={scheduler.pending ? 'orange' : 'default'}>{String(scheduler.pending)}</Tag>
        </Space>

        <Space>
          <Typography.Text>合并观测（invoke/schedule）</Typography.Text>
          <Tag>{mergedRatio}</Tag>
        </Space>
      </Flex>

      <Divider style={{ margin: '8px 0' }} />

      <Flex gap={12} wrap="wrap" align="center">
        <Button type="primary" onClick={() => scheduleOnce('single')}>
          schedule 一次
        </Button>

        <Space>
          <Button onClick={burstScheduleSameTick}>同一 tick 连续 schedule（burst）</Button>
          <Typography.Text>次数</Typography.Text>
          <InputNumber
            min={1}
            max={50}
            value={burstCount}
            onChange={(v) => setBurstCount(Number(v ?? 1))}
          />
        </Space>

        <Button onClick={scheduler.flush}>flush()</Button>
        <Button onClick={scheduler.cancel}>cancel()</Button>
        <Button danger onClick={clearLogs}>
          清空日志
        </Button>
      </Flex>

      <Flex gap={12} wrap="wrap" align="center">
        <Space>
          <Typography.Text strong>Auto spam</Typography.Text>
          <Switch checked={autoSpam} onChange={setAutoSpam} />
        </Space>
        <Space>
          <Typography.Text>间隔(ms)</Typography.Text>
          <InputNumber
            min={5}
            step={5}
            value={spamEveryMs}
            onChange={(v) => setSpamEveryMs(Number(v ?? 20))}
          />
          <Typography.Text type="secondary">
            （建议：Timeout 模式 delay 设大一点，spamEveryMs 设小一点，更容易看到一帧合并很多次）
          </Typography.Text>
        </Space>
      </Flex>

      <Divider style={{ margin: '8px 0' }} />

      <Flex gap={12} wrap="wrap">
        <div style={{ flex: 1, minWidth: 320 }}>
          <Typography.Text strong>
            schedule 事件（越多越容易看到“同帧只执行最后一次”）
          </Typography.Text>
          <List
            size="small"
            bordered
            style={{ marginTop: 8 }}
            dataSource={scheduleEvents}
            renderItem={(it) => (
              <List.Item>
                <Space wrap>
                  <Tag>seq={it.seq}</Tag>
                  <Tag>{it.label}</Tag>
                  <Typography.Text type="secondary">at={it.at.toFixed(1)}</Typography.Text>
                </Space>
              </List.Item>
            )}
          />
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          <Typography.Text strong>
            invoke 事件（takeLatest 只会看到最后一次 payload；Timeout 模式更明显）
          </Typography.Text>
          <List
            size="small"
            bordered
            style={{ marginTop: 8 }}
            dataSource={invokeEvents}
            renderItem={(it) => (
              <List.Item>
                <Space orientation="vertical" size={2} style={{ width: '100%' }}>
                  <Space wrap>
                    <Tag color={it.reason === 'frame' ? 'green' : 'purple'}>reason={it.reason}</Tag>
                    <Tag>payload.seq={it.invokedSeq}</Tag>
                    <Tag>{it.invokedLabel}</Tag>
                    <Tag color="blue">mergedInFrame={it.mergedCountInFrame}</Tag>
                  </Space>

                  <Space wrap>
                    <Typography.Text type="secondary">at={it.at.toFixed(1)}</Typography.Text>
                    {typeof it.frameTime === 'number' && (
                      <Typography.Text type="secondary">
                        frameTime={it.frameTime.toFixed(1)}
                      </Typography.Text>
                    )}
                    {typeof it.cost === 'number' && (
                      <Typography.Text type="secondary">
                        cost={it.cost.toFixed(2)}ms
                      </Typography.Text>
                    )}
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        </div>
      </Flex>

      <Typography.Paragraph style={{ marginTop: 8 }} type="secondary">
        观察要点：
        <br />
        1) 点击 “burst” 会在同一 tick 内连续 schedule 多次，但下一次 frame/timeout tick 只会 invoke
        一次； payload 会是最后一次（takeLatest）。
        <br />
        2) Timeout(慢帧) 下 mergedInFrame 往往会很大，现象更直观；切回真实 rAF
        后语义一致，但由于帧很快更难肉眼观察。
      </Typography.Paragraph>
    </Space>
  );
}
