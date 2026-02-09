/**
 * title: 滑块人机校验
 * description: 拖动拼图块到缺口附近；停止拖动 300ms 后触发防抖校验（模拟远程校验）
 */
import React, { useMemo, useState } from 'react';
import { Alert, Button, Slider, Space, Tag, Typography, message } from 'antd';
import { useDebouncedEffect } from '@tx-labs/react-hooks';

type VerifyStatus = 'idle' | 'verifying' | 'success' | 'fail';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function randomGap() {
  // 避免太靠边
  return Math.floor(15 + Math.random() * 70); // 15~85
}

// 模拟远程校验：500ms 后返回是否在容差范围内
function mockVerify(position: number, gap: number, tolerance: number) {
  return new Promise<boolean>((resolve) => {
    window.setTimeout(() => {
      resolve(Math.abs(position - gap) <= tolerance);
    }, 500);
  });
}

export default function DemoSliderCaptcha() {
  const [gap, setGap] = useState(() => randomGap());
  const [position, setPosition] = useState(0);
  const [status, setStatus] = useState<VerifyStatus>('idle');
  const [attempts, setAttempts] = useState(0);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const tolerance = 3;

  const statusTag = useMemo(() => {
    if (status === 'success') return <Tag color="success">通过</Tag>;
    if (status === 'verifying') return <Tag color="processing">校验中</Tag>;
    if (status === 'fail') return <Tag color="error">未通过</Tag>;
    return <Tag>等待拖动</Tag>;
  }, [status]);

  const tip = useMemo(() => {
    if (status === 'success') return '已通过：你可以点击“重置挑战”体验下一次。';
    if (status === 'fail') return '未通过：继续微调位置，停止拖动后会重新校验。';
    return '拖动拼图块到缺口附近；停止拖动 300ms 后触发校验（防抖）。';
  }, [status]);

  const reset = () => {
    setGap(randomGap());
    setPosition(0);
    setStatus('idle');
    setAttempts(0);
    setLastCheckedAt(null);
    message.info('已重置挑战');
  };

  useDebouncedEffect(
    () => {
      // 已通过就不再校验（更贴近真实人机验证）
      if (status === 'success') return;

      // 初始值不触发校验（让 demo 更自然）
      if (attempts === 0 && position === 0) return;

      let cancelled = false;

      setStatus('verifying');
      setLastCheckedAt(Date.now());

      mockVerify(position, gap, tolerance).then((ok) => {
        if (cancelled) return;

        setAttempts((n) => n + 1);

        if (ok) {
          setStatus('success');
          message.success('校验通过');
        } else {
          setStatus('fail');
        }
      });

      // cleanup：如果用户在校验返回前又移动了滑块，则忽略上一轮结果
      return () => {
        cancelled = true;
      };
    },
    [position, gap],
    {
      delay: 300,
      skipInitial: true, // 阻止页面初始化时直接触发副作用
    },
  );

  // 视觉：把 0~100 映射到 track 像素
  const trackWidth = 320;
  const px = (position / 100) * trackWidth;
  const gapPx = (gap / 100) * trackWidth;

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert type="info" showIcon title={tip} />

      <Space align="center" size={12} wrap>
        <Typography.Text>状态：</Typography.Text>
        {statusTag}

        <Typography.Text type="secondary">尝试次数：</Typography.Text>
        <Typography.Text>{attempts}</Typography.Text>

        <Typography.Text type="secondary">最近校验：</Typography.Text>
        <Typography.Text>
          {lastCheckedAt ? new Date(lastCheckedAt).toLocaleTimeString() : '-'}
        </Typography.Text>

        <Button onClick={reset}>重置挑战</Button>
      </Space>

      <div
        style={{
          width: trackWidth,
          padding: 12,
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          position: 'relative',
          userSelect: 'none',
        }}
      >
        <Typography.Text type="secondary">拼图区域（示意）</Typography.Text>

        {/* 缺口 */}
        <div
          style={{
            position: 'absolute',
            left: gapPx,
            top: 46,
            width: 36,
            height: 36,
            transform: 'translateX(-18px)',
            border: '2px dashed rgba(0,0,0,0.25)',
            borderRadius: 6,
          }}
        />

        {/* 拼图块 */}
        <div
          style={{
            position: 'absolute',
            left: px,
            top: 46,
            width: 36,
            height: 36,
            transform: 'translateX(-18px)',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            background: status === 'success' ? 'rgba(82,196,26,0.25)' : 'rgba(24,144,255,0.2)',
            border:
              status === 'fail'
                ? '2px solid rgba(245,34,45,0.5)'
                : '2px solid rgba(24,144,255,0.35)',
          }}
        />

        <div style={{ marginTop: 84 }}>
          <Slider
            min={0}
            max={100}
            value={position}
            onChange={(v) => setPosition(clamp(Number(v), 0, 100))}
            tooltip={{ formatter: (v) => `${v}%` }}
          />
        </div>

        <Space size={12} wrap>
          <Typography.Text type="secondary">当前位置：</Typography.Text>
          <Typography.Text>{position}%</Typography.Text>

          <Typography.Text type="secondary">容差：</Typography.Text>
          <Typography.Text>±{tolerance}%</Typography.Text>
        </Space>

        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          说明：这里用滑块模拟“拼图移动到缺口”。真实人机校验常伴随频繁位置变化与远程校验请求，使用
          useDebouncedEffect 可以避免拖动过程中的高频请求，只在停止拖动后触发校验。
        </Typography.Paragraph>
      </div>
    </Space>
  );
}
