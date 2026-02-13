/**
 * title: 条件执行（双层守卫）+ 慢速/正常切换
 * description: shouldSchedule（调度前）+ shouldInvoke（执行前二次检查）；可切换 Timeout 慢速帧 与 RAF 正常帧，便于观察行为。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Divider, Flex, Space, Switch, Tag, Typography } from 'antd';
import {
  useRafScheduler,
  createTimeoutDriver,
  createFrameDriver,
  useBoolean,
} from '@tx-labs/react-hooks';

export default function DemoUseRafSchedulerGuards() {
  const [shouldInvoke, { toggle: toggleShouldInvoke }] = useBoolean(true);
  const [slowMode, { toggle: toggleMode }] = useBoolean(true);

  const [value, setValue] = useState(0);
  const [committed, setCommitted] = useState(0);

  // 让 shouldSchedule “可观测”：统计被拦截次数
  const [scheduleAccepted, setScheduleAccepted] = useState(0);
  const [scheduleSkipped, setScheduleSkipped] = useState(0);

  const slowDriver = useMemo(() => {
    return createTimeoutDriver({
      delay: 3000,
      type: 'timeout-3000ms',
    });
  }, []);

  const rafDriver = useMemo(() => {
    return createFrameDriver({ fallback: 'timeout', fallbackDelay: 16 });
  }, []);

  const driver = slowMode ? slowDriver : rafDriver;

  const scheduler = useRafScheduler<number>(
    (payload) => {
      setCommitted(payload);
    },
    {
      driver,

      // 调度前守卫：pending 与 next 相同则跳过（节省一次 tick）
      shouldSchedule: (pending, next) => {
        const baseline = pending ?? committed;
        const ok = baseline !== next;

        if (ok) setScheduleAccepted((x) => x + 1);
        else setScheduleSkipped((x) => x + 1);

        return ok;
      },

      // 执行前二次守卫：tick 真触发时再判断一次
      shouldInvoke: () => shouldInvoke,
    },
  );

  // 切换 driver 时，为避免旧 driver 的 pending tick 干扰观察，直接 cancel 一下
  useEffect(() => {
    scheduler.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slowMode]);

  return (
    <Card
      size="small"
      title={
        <Space>
          <span>useRafScheduler - 条件执行（shouldSchedule + shouldInvoke）</span>
          <Tag color={slowMode ? 'blue' : 'green'}>
            {slowMode ? 'Timeout 慢速帧' : 'RAF 正常帧'}
          </Tag>
        </Space>
      }
      extra={<Button onClick={toggleMode}>切换到 {slowMode ? '正常帧' : '慢速帧'}</Button>}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Flex gap={8} align="center" wrap="wrap">
          <Typography.Text>shouldInvoke：</Typography.Text>
          <Switch checked={shouldInvoke} onChange={toggleShouldInvoke} />
          <Typography.Text type="secondary">关闭后，即使 tick 到点也会丢弃执行</Typography.Text>
        </Flex>

        <Space wrap>
          <Button
            onClick={() => {
              const next = value + 1;
              setValue(next);
              scheduler.schedule(next);
            }}
          >
            +1 并 schedule
          </Button>

          <Button
            onClick={() => {
              // 同步 schedule 相同值：shouldSchedule 会拦掉
              scheduler.schedule(value);
            }}
          >
            schedule 相同值（shouldSchedule=false，应跳过）
          </Button>

          <Button onClick={() => scheduler.flush()}>flush</Button>
          <Button onClick={() => scheduler.cancel()}>cancel</Button>
        </Space>

        <Divider style={{ margin: '8px 0' }} />

        <Flex gap={16} wrap="wrap">
          <Typography.Text>
            value：<Typography.Text strong>{value}</Typography.Text>
          </Typography.Text>
          <Typography.Text>
            committed：<Typography.Text strong>{committed}</Typography.Text>
          </Typography.Text>
        </Flex>

        <Tag>
          shouldSchedule：accepted={scheduleAccepted} / skipped={scheduleSkipped}
        </Tag>

        <Flex gap={8} align="center" wrap="wrap">
          <Typography.Text>pending：</Typography.Text>
          <Tag color={scheduler.pending ? 'processing' : 'default'}>
            {scheduler.pending ? 'true' : 'false'}
          </Tag>
          <Typography.Text type="secondary">
            latest payload：{String(scheduler.getLatestPayload() ?? '-')}
          </Typography.Text>
        </Flex>
      </Space>
    </Card>
  );
}
