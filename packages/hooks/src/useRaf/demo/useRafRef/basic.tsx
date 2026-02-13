/**
 * title: 基础用法（高频输入 -> ref，loop 读取）
 * description: pointermove 很频繁，但我们不 setState；用 useRafRef 把坐标按帧写入 ref，再用 loop 读取并移动小点（imperative，不依赖 rerender）。
 */
import React from 'react';
import { Card, Space, Tag, Typography } from 'antd';
import { useRafLoop, useRafRef } from '@tx-labs/react-hooks';

interface Point {
  x: number;
  y: number;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function DemoUseRafRefBasic() {
  const DOT = 10;
  const R = DOT / 2;

  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const dotRef = React.useRef<HTMLDivElement | null>(null);

  const moveEventsRef = React.useRef(0);
  const [info, setInfo] = React.useState({ events: 0, pending: false });

  const [posRef, setPos, actions] = useRafRef<Point>({ x: R, y: R });

  // 每帧读 ref.current，然后用 imperative 方式更新 DOM（不靠 React rerender）
  useRafLoop(() => {
    const p = posRef.current;
    if (dotRef.current) {
      dotRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
    }
  });

  // 低频刷新一下面板信息（避免每帧 rerender）
  React.useEffect(() => {
    const id = window.setInterval(() => {
      setInfo({ events: moveEventsRef.current, pending: actions.isPending() });
    }, 200);
    return () => window.clearInterval(id);
  }, [actions]);

  return (
    <Card size="small" title="useRafRef - basic">
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Space wrap align="center">
          <Tag>pointer events: {info.events}</Tag>
          <Tag color={info.pending ? 'processing' : 'default'}>pending: {String(info.pending)}</Tag>
          <Typography.Text type="secondary">
            移动很多次也不会触发大量 rerender（点移动是 imperative）
          </Typography.Text>
        </Space>

        <div
          ref={boxRef}
          onPointerMove={(e) => {
            moveEventsRef.current += 1;

            const el = e.currentTarget;
            const rect = el.getBoundingClientRect();

            const x = clamp(Math.round(e.clientX - rect.left), R, rect.width - R);
            const y = clamp(Math.round(e.clientY - rect.top), R, rect.height - R);

            setPos({ x, y }); // 高频写入：同帧合并到下一帧写入 posRef.current
          }}
          style={{
            position: 'relative',
            height: 200,
            border: '1px dashed #d9d9d9',
            borderRadius: 8,
            overflow: 'hidden',
            userSelect: 'none',
          }}
        >
          <div
            ref={dotRef}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: DOT,
              height: DOT,
              borderRadius: 999,
              background: '#1677ff',
              transform: `translate(${R}px, ${R}px)`,
              willChange: 'transform',
            }}
          />
        </div>
      </Space>
    </Card>
  );
}
