/**
 * title: reset 对照组
 * description: 现象对照：成功按钮点击后进入窗口期，连续点会被拦截；失败按钮点击失败后会
        reset，下一次可立即点击重试。
 */
import React, { useMemo, useState } from 'react';
import { Alert, Button, Space, Typography, message } from 'antd';
import { useBoolean, useDebouncedClick } from '@tx-labs/react-hooks';

function mockSuccessRequest(): Promise<undefined> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(), 700);
  });
}

function mockFailRequest(): Promise<undefined> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error('请求失败（固定失败）')), 700);
  });
}

export default function DemoReset() {
  const [delay] = useState(3000);

  const [loadingOk, loadingOkActions] = useBoolean(false);
  const [loadingFail, loadingFailActions] = useBoolean(false);

  const [clickOk, okActions] = useDebouncedClick(
    async () => {
      if (loadingOk) return;

      loadingOkActions.setTrue();
      try {
        await mockSuccessRequest();
        message.success('成功按钮：请求成功（窗口期内会拦截后续点击）');
      } finally {
        loadingOkActions.setFalse();
      }
    },
    { delay },
  );

  const [clickFail, failActions] = useDebouncedClick(
    async () => {
      if (loadingFail) return;

      loadingFailActions.setTrue();
      try {
        await mockFailRequest();
      } catch (e: any) {
        message.error(`${e?.message || '请求失败'}：已 reset，允许立刻重试`);
        failActions.reset(); // 关键：失败后立刻结束窗口期
      } finally {
        loadingFailActions.setFalse();
      }
    },
    { delay },
  );

  const tip = useMemo(() => {
    return `窗口期 ${delay}ms：成功按钮不会 reset（所以窗口期内拦截）；失败按钮会 reset（所以失败后可立即重试）。`;
  }, [delay]);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert type="info" showIcon title={tip} />

      <Space size={12} wrap>
        <Button
          type="primary"
          onClick={clickOk}
          loading={loadingOk}
          disabled={okActions.pending && !loadingOk}
        >
          永远成功（不 reset）
        </Button>

        <Button onClick={okActions.reset} disabled={!okActions.pending}>
          手动 reset（成功按钮）
        </Button>
      </Space>

      <Space size={12}>
        <Typography.Text type="secondary">成功按钮 pending：</Typography.Text>
        <Typography.Text>{okActions.pending ? 'true' : 'false'}</Typography.Text>
      </Space>

      <Space>
        <Button
          danger
          onClick={clickFail}
          loading={loadingFail}
          disabled={failActions.pending && !loadingFail}
        >
          永远失败（失败后 reset）
        </Button>
      </Space>

      <Space size={12}>
        <Typography.Text type="secondary">失败按钮 pending：</Typography.Text>
        <Typography.Text>{failActions.pending ? 'true' : 'false'}</Typography.Text>
      </Space>
    </Space>
  );
}
