/**
 * title: 基础用法（滚动阅读进度）
 * description: scroll 事件高频触发；用 useRafState 把 UI 更新合并到“每帧最多一次”。
 */
import React, { useRef } from 'react';
import { Button, Card, Flex, Space, Tag, Typography } from 'antd';
import { useRafState } from '@tx-labs/react-hooks';

export default function DemoUseRafStateBasic() {
  const boxRef = useRef<HTMLDivElement | null>(null);

  const [{ top, progress }, setScroll, a] = useRafState({ top: 0, progress: 0 });

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;

    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    const nextTop = el.scrollTop;
    const nextProgress = Math.round((nextTop / max) * 100);

    setScroll({ top: nextTop, progress: nextProgress });
  };

  return (
    <Card size="small" title="useRafState - 滚动阅读进度">
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <div style={{ height: 6, background: '#f0f0f0', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: '#1677ff' }} />
        </div>

        <Flex gap={8} wrap="wrap" align="center">
          <Tag>progress: {progress}%</Tag>
          <Tag>scrollTop: {Math.round(top)}</Tag>
          <Tag color={a.pending ? 'processing' : 'default'}>pending: {String(a.pending)}</Tag>
          <Button
            size="small"
            onClick={() => {
              boxRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            回到顶部
          </Button>
        </Flex>

        <div
          ref={boxRef}
          onScroll={onScroll}
          style={{
            height: 240,
            overflow: 'auto',
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            一段可滚动内容
          </Typography.Title>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
            <Typography.Paragraph key={`para-${n}`} style={{ marginBottom: 12 }}>
              第 {n} 段：这是用来制造滚动高度的内容。滚动时会触发很多 scroll 事件，但 useRafState
              会把 state 提交合并到每帧最多一次。
            </Typography.Paragraph>
          ))}
        </div>

        <Typography.Text type="secondary">
          说明：这里用 state 驱动进度条/数值更新。高频 scroll 下，用 useRafState
          可以减少不必要的重复 commit。
        </Typography.Text>
      </Space>
    </Card>
  );
}
