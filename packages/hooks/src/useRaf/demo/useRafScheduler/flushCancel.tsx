/**
 * title: flush / cancel（可切换慢速帧/正常帧）
 * description: flush 立刻同步执行一次；cancel 撤销下一帧执行并清空 pending（适合测试/离开页面前强制提交）
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Descriptions, Space, Tag, Typography } from 'antd';
import {
  useRafScheduler,
  createTimeoutDriver,
  createFrameDriver,
  useBoolean,
  useForceUpdate,
} from '@tx-labs/react-hooks';

export default function DemoUseRafSchedulerFlushCancel() {
  const [lastPayload, setLastPayload] = useState<number | null>(null);
  const [lastReason, setLastReason] = useState<string>('-');

  const [slowMode, { toggle: toggleMode }] = useBoolean(true);

  const forceUpdate = useForceUpdate();

  const slowDriver = useMemo(() => {
    return createTimeoutDriver({
      delay: 2000,
      type: 'timeout-2000ms',
      // 如果你已修复 createTimeoutDriver 的 bind 问题，这两行可以删
      setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
      clearTimeout: (id) => globalThis.clearTimeout(id),
    });
  }, []);

  const rafDriver = useMemo(() => {
    return createFrameDriver({ fallback: 'timeout', fallbackDelay: 16 });
  }, []);

  const driver = slowMode ? slowDriver : rafDriver;

  const scheduler = useRafScheduler<number>(
    (payload, meta) => {
      setLastPayload(payload);
      setLastReason(meta.reason);
    },
    { driver },
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
          <span>useRafScheduler - flush / cancel</span>
          <Tag color={slowMode ? 'blue' : 'green'}>
            {slowMode ? 'Timeout 慢速帧' : 'RAF 正常帧'}
          </Tag>
        </Space>
      }
      extra={<Button onClick={toggleMode}>切换到 {slowMode ? '正常帧' : '慢速帧'}</Button>}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Space wrap>
          <Button
            onClick={() => {
              scheduler.schedule(Date.now());
              forceUpdate();
            }}
          >
            schedule(Date.now())
          </Button>

          <Button
            onClick={() => {
              scheduler.flush();
            }}
          >
            flush（同步执行）
          </Button>

          <Button
            onClick={() => {
              scheduler.cancel();
            }}
          >
            cancel（撤销）
          </Button>
        </Space>

        <Space align="center">
          <Typography.Text>pending：</Typography.Text>
          <Tag color={scheduler.pending ? 'processing' : 'default'}>
            {scheduler.pending ? 'true' : 'false'}
          </Tag>
          <Typography.Text>latest payload： {scheduler.getLatestPayload()}</Typography.Text>
        </Space>

        <Descriptions size="small" bordered column={1}>
          <Descriptions.Item label="last payload">{lastPayload ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="last reason">{lastReason}</Descriptions.Item>
        </Descriptions>
      </Space>
    </Card>
  );
}
