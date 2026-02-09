/**
 * title: 基础用法
 * description: ref.current 变化不会触发渲染；useForceUpdate 可在需要时手动刷新 UI（逃生舱场景）
 */
import React, { useRef } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { useForceUpdate } from '@tx-labs/react-hooks';

export default function DemoUseForceUpdateBasic() {
  const forceUpdate = useForceUpdate();

  // 模拟外部可变数据：放在 ref 里（变化不触发 render）
  const countRef = useRef(0);

  const mutateRef = () => {
    countRef.current += 1;
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type="info"
        showIcon
        title="操作：先点“仅更新 ref”，你会发现页面不变；再点“强制刷新 UI”，页面才会显示最新 ref 值。"
      />

      <Typography.Text>当前展示的 ref 值：{countRef.current}</Typography.Text>

      <Space size={12} wrap>
        <Button onClick={mutateRef}>仅更新 ref（不触发渲染）</Button>
        <Button type="primary" onClick={forceUpdate}>
          强制刷新 UI
        </Button>
      </Space>

      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        说明：这里刻意用 ref 模拟“外部可变数据”。真实业务里更推荐把数据建模为 state 或使用订阅机制。
        useForceUpdate 适合用于桥接与应急，避免滥用。
      </Typography.Paragraph>
    </Space>
  );
}
