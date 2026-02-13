/**
 * title: 性能监控 + 错误隔离
 * description: 开启 monitor 计算 cost，超过阈值 warn；invoke 抛错被隔离，不影响 scheduler 状态机
 */
import React, { useRef, useState } from 'react';
import { Alert, Button, Card, Flex, message, Space, Switch, Tag, Typography } from 'antd';
import { useBoolean, useRafScheduler } from '@tx-labs/react-hooks';

export default function DemoUseRafSchedulerMonitorAndError() {
  const [throwError, { toggle: toggleThrowError }] = useBoolean(false);
  const [committed, setCommitted] = useState(0);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [warnCount, setWarnCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const warnThresholdMs = 8;

  // 控制“本次 invoke 要忙多久”：flush 按钮会把它临时调大以触发 warn
  const workMsRef = useRef(0);

  const now = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const busy = (ms: number) => {
    const start = now();
    while (now() - start < ms) {
      // busy loop
    }
  };

  const scheduler = useRafScheduler<number>(
    (payload, meta) => {
      // demo：制造一点工作量（不要在真实业务写 busy loop）
      busy(workMsRef.current);

      // meta.cost 会在 invoke 返回后才被写入（实现里的 finally）
      // 用 microtask 等本轮 callstack 结束后再读，就能拿到最新 cost
      queueMicrotask(() => {
        if (typeof meta.cost === 'number') setLastCost(meta.cost);
      });

      if (throwError) {
        throw new Error('demo error');
      }

      setCommitted(payload);
    },
    {
      monitor: true,
      warnThresholdMs,
      onWarn: (_message, info) => {
        setWarnCount((x) => x + 1);
        message.warning(`性能告警：本次帧任务执行用时 ${info.cost?.toFixed(2)}ms`);
        // 触发 warn 时顺便更新一次 cost（更直观）
        setLastCost(info.cost);
      },
      onError: (e) => {
        setErrorCount((x) => x + 1);
        message.error(`本次帧任务报错：${e}`);
      },
    },
  );

  const schedulePlusOne = () => {
    scheduler.schedule(committed + 1);
  };

  const flushHeavyToTriggerWarn = () => {
    // flush 本身是同步执行：先 schedule 一个 payload，再 flush 立刻执行
    // 临时把工作量拉长到 > warnThresholdMs，确保触发 warn
    const prev = workMsRef.current;
    workMsRef.current = Math.max(prev, warnThresholdMs + 4);

    scheduler.schedule(committed + 1);
    scheduler.flush(); // 同步执行（reason='flush'）

    workMsRef.current = prev;
  };

  return (
    <Card size="small" title="useRafScheduler - 性能监控 + 错误隔离">
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Flex gap={8} align="center" wrap="wrap">
          <Typography.Text>throw error：</Typography.Text>
          <Switch checked={throwError} onChange={toggleThrowError} />
          <Typography.Text type="secondary">
            开启后 invoke 会抛错，但 scheduler 不应崩
          </Typography.Text>
        </Flex>

        <Space wrap>
          <Button onClick={schedulePlusOne}>schedule(+1)</Button>
          <Button onClick={flushHeavyToTriggerWarn}>flush（同步执行长任务触发 warn）</Button>
        </Space>

        <Flex gap={8} align="center" wrap="wrap">
          <Typography.Text>pending：</Typography.Text>
          <Tag color={scheduler.pending ? 'processing' : 'default'}>
            {scheduler.pending ? 'true' : 'false'}
          </Tag>
        </Flex>

        <Alert
          type="info"
          showIcon
          title="监控信息（demo）"
          description={
            <Space orientation="vertical" size={4}>
              <Typography.Text>committed：{committed}</Typography.Text>
              <Typography.Text>
                last cost：{lastCost == null ? '-' : `${lastCost.toFixed(2)}ms`}
              </Typography.Text>
              <Typography.Text>warn count：{warnCount}</Typography.Text>
              <Typography.Text>error count：{errorCount}</Typography.Text>
              <Typography.Text type="secondary">
                说明：meta.cost 在 invoke 返回后写入，因此 demo 用 microtask 延迟读取来拿到最新值。
              </Typography.Text>
            </Space>
          }
        />
      </Space>
    </Card>
  );
}
