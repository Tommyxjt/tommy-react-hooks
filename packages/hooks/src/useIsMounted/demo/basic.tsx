/**
 * title: 异步回调防“卸载后更新”
 * description: 模拟一个不可取消的 Promise 请求；卸载组件后回调仍会回来，但会被 isMounted() 安全忽略
 */
import React, { useRef, useState } from 'react';
import { Alert, Button, Space, Typography, message } from 'antd';
import { useBoolean, useIsMounted } from '@tx-labs/react-hooks';

function fakeRequest(keyword: string) {
  // 模拟一个不可取消的异步请求（Promise 无法像 timer 一样可靠 cancel）
  return new Promise<string>((resolve) => {
    window.setTimeout(() => resolve(`服务端返回：${keyword}`), 1500);
  });
}

function RequestPanel() {
  const isMounted = useIsMounted();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('-');

  // 用于避免并发请求“后发先至”覆盖（让 demo 行为更稳定）
  const requestSeqRef = useRef(0);

  const run = async () => {
    const seq = ++requestSeqRef.current;

    setLoading(true);
    message.info('已发起请求：1.5s 后返回（可在返回前卸载组件）');

    try {
      const data = await fakeRequest(`req#${seq}`);

      // 关键点：回调回来时先判断是否还 mounted
      if (!isMounted()) {
        message.warning('请求返回，但组件已卸载：本次回调已忽略');
        return;
      }

      // 关键点：避免并发覆盖（不是 useIsMounted 的核心，但真实业务常见）
      if (seq !== requestSeqRef.current) {
        message.info('收到过期请求结果：已忽略');
        return;
      }

      setResult(data);
      message.success('请求返回并已更新 UI');
    } finally {
      // 注意：finally 也要保护，避免卸载后 setLoading
      if (isMounted()) setLoading(false);
    }
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        showIcon
        type="info"
        message="点击“发起请求”，立刻点击“卸载组件”。你会看到请求仍返回，但不会更新已卸载组件。"
      />

      <Button type="primary" onClick={run} loading={loading}>
        发起请求（Promise）
      </Button>

      <Space size={12}>
        <Typography.Text type="secondary">loading：</Typography.Text>
        <Typography.Text>{String(loading)}</Typography.Text>
      </Space>

      <Space size={12}>
        <Typography.Text type="secondary">result：</Typography.Text>
        <Typography.Text>{result}</Typography.Text>
      </Space>
    </Space>
  );
}

export default function DemoUseIsMounted() {
  const [mounted, { toggle }] = useBoolean(true);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      {mounted ? <RequestPanel /> : <Alert showIcon type="warning" message="组件已卸载" />}

      <Button danger={mounted} onClick={toggle}>
        {mounted ? '卸载组件' : '挂载组件'}
      </Button>
    </Space>
  );
}
