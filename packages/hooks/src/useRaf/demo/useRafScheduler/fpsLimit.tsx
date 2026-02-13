/**
 * title: 帧率限制
 * description: 单实例 maxFps 限速：即使 schedule 非常频繁，也会主动跳帧让该实例以更低频率触发
 */
import React, { useState, useEffect } from 'react';
import { Card, Flex, Space, Statistic, Tag, Typography } from 'antd';
import { useRafScheduler } from '@tx-labs/react-hooks';

export default function DemoUseRafSchedulerFpsLimit() {
  const [raw, setRaw] = useState(0);
  const [rendered, setRendered] = useState(0);

  const scheduler = useRafScheduler<number>(
    (payload) => {
      setRendered(payload);
    },
    {
      // 例如 6fps：单实例最小可行限速
      maxFps: 6,
    },
  );

  useEffect(() => {
    // 模拟高频数据源（例如 scroll/drag/订阅）
    const id = setInterval(() => {
      // 累加到 9999 重置是为了防止布局抖动
      setRaw((x) => {
        if (x <= 9999) return x + 1;
        else return 0;
      });
    }, 5);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    scheduler.schedule(raw);
  }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card size="small" title="useRafScheduler - 帧率限制（maxFps=6）">
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Flex gap={12} wrap="wrap">
          <Statistic title="raw（高频）" value={raw} />
          <Statistic title="rendered（限速）" value={rendered} />
        </Flex>

        <Flex gap={8} align="center" wrap="wrap">
          <Typography.Text>pending：</Typography.Text>
          <Tag color={scheduler.pending ? 'processing' : 'default'}>
            {scheduler.pending ? 'true' : 'false'}
          </Tag>
        </Flex>

        <Typography.Text type="secondary">
          说明：这是“单实例”限速；多实例的跨实例合并/优先级 Lane 后续由 shared driver 做增强。
        </Typography.Text>
      </Space>
    </Card>
  );
}
