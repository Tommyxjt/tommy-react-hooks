/**
 * title: merge 累计（可切换慢速帧/正常帧）
 * description: 用 merge 把同一帧内的多次 schedule 累计起来（例如同帧内多次 +1，最终下一帧只 setState 一次）
 */
import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, Flex, Space, Statistic, Tag, Typography } from 'antd';
import {
  useRafScheduler,
  createTimeoutDriver,
  createFrameDriver,
  useForceUpdate,
} from '@tx-labs/react-hooks';

export default function DemoUseRafSchedulerMergeAccumulate() {
  const [count, setCount] = useState(0);
  const [slowMode, setSlowMode] = useState(true);
  const forceUpdate = useForceUpdate();

  const slowDriver = useMemo(() => {
    return createTimeoutDriver({
      delay: 3000, // 慢速帧：把“同帧 merge”现象拉长到肉眼可见
      type: 'timeout-3000ms',
    });
  }, []);

  const rafDriver = useMemo(() => {
    return createFrameDriver({ fallback: 'timeout', fallbackDelay: 16 });
  }, []);

  const driver = slowMode ? slowDriver : rafDriver;

  const scheduler = useRafScheduler<number>(
    (delta) => {
      // 一帧只执行一次：count += 合并后的 delta
      setCount((c) => c + delta);
    },
    {
      driver,
      // merge：把同一帧内的多次 payload 合并成一个
      merge: (prev, next) => prev + next,
    },
  );

  return (
    <Card
      size="small"
      title={
        <Space>
          <span>useRafScheduler - merge 累计</span>
          <Tag color={slowMode ? 'blue' : 'green'}>
            {slowMode ? 'Timeout 慢速帧' : 'RAF 正常帧'}
          </Tag>
        </Space>
      }
      extra={
        <Button
          onClick={() => {
            setSlowMode((v) => !v);
          }}
        >
          切换到 {slowMode ? '正常帧' : '慢速帧'}
        </Button>
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Alert
          type="warning"
          showIcon
          title="当切换 FrameDriver 时，如果旧 driver 已经挂起 pending tick，该次 pending tick 会按照挂起时使用的 driver 执行完毕，然后下一帧的 “帧调度” 才会使用切换后的新 driver。"
        />
        <Flex gap={12} wrap="wrap">
          <Statistic title="count" value={count} />
          <Statistic title="pending" value={scheduler.pending ? 'true' : 'false'} />
          <Statistic
            title="latest payload"
            value={scheduler.getLatestPayload() ?? '-'}
            formatter={(v) => String(v)}
          />
        </Flex>

        <Space wrap>
          <Button
            onClick={() => {
              scheduler.schedule(1);

              // 由于页面的 state 只有首次点击按钮进行 schedule 的时候，pending 会变化导致 render，
              // 还有下一帧 tick 执行的时候，count 变化触发 rerender，
              // 中间点击的时候，只会改变 latestPayloadRef，而 ref 更新不会触发 rerender。
              // 为了让页面上能够直观展示最新的 latestPayloadRef 值，
              // 这里使用 forceUpdate 强制触发 rerender 让 latest payload 立刻可见。
              forceUpdate();
            }}
          >
            schedule(+1)
          </Button>

          <Button
            onClick={() => {
              // 同步连发多次：非常容易落在同一帧，merge 会累计起来
              scheduler.schedule(1);
              scheduler.schedule(1);
              scheduler.schedule(1);

              // 这边的 forceUpdate() 与上面同理
              forceUpdate();
            }}
          >
            同步 schedule 3 次（同帧累计）
          </Button>

          <Button
            onClick={() => {
              scheduler.flush();
            }}
          >
            flush
          </Button>

          <Button
            onClick={() => {
              scheduler.cancel();
            }}
          >
            cancel
          </Button>
        </Space>

        <Typography.Text type="secondary">
          说明：merge 只影响“同一帧内多次 schedule 的合并结果”，不会改变跨帧的行为。
        </Typography.Text>

        <Tag>
          pending getter：{scheduler.pending ? 'true' : 'false'}（渲染用）；isPending：{' '}
          {scheduler.isPending() ? 'true' : 'false'}（函数式读取）
        </Tag>
      </Space>
    </Card>
  );
}
