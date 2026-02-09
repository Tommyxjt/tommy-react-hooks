/**
 * title: 表单项自动校验
 * description: 输入停止 400ms 后触发校验（模拟远程校验/昂贵校验）
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Flex, Form, Input, Space, Typography } from 'antd';
import { useDebouncedState } from '@tx-labs/react-hooks';

function validateEmailFormat(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateUsernameLocal(username: string) {
  return username.length >= 3;
}

// 模拟 “服务端校验用户名是否被占用”
function mockCheckUsernameAvailable(username: string): Promise<boolean> {
  const taken = new Set(['admin', 'root', 'tommy', 'test']);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve(!taken.has(username.toLowerCase()));
    }, 500);
  });
}

export default function DemoAutoValidate() {
  const [form] = Form.useForm();

  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'validating' | 'ok' | 'error'>(
    'idle',
  );
  const [usernameHelp, setUsernameHelp] = useState<string>('');

  const [emailStatus, setEmailStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [emailHelp, setEmailHelp] = useState<string>('');

  const [username, setUsername, usernameControls] = useDebouncedState<string>('', { delay: 400 });
  const [email, setEmail, emailControls] = useDebouncedState<string>('', { delay: 400 });

  const debouncedUsername = usernameControls.debouncedState;
  const debouncedEmail = emailControls.debouncedState;

  const usernameExtraTip = useMemo(() => {
    if (!username) return '输入用户名后停止 400ms 才会开始校验';
    if (usernameControls.pending) return '等待稳定...';
    if (usernameStatus === 'validating') return '校验中...';
    return '';
  }, [username, usernameControls.pending, usernameStatus]);

  useEffect(() => {
    const u = debouncedUsername.trim();

    // 空值：重置状态
    if (!u) {
      setUsernameStatus('idle');
      setUsernameHelp('');
      return;
    }

    // 先做本地校验（长度）
    if (!validateUsernameLocal(u)) {
      setUsernameStatus('error');
      setUsernameHelp('用户名至少 3 个字符');
      return;
    }

    // 再做“远程校验”
    let cancelled = false;
    setUsernameStatus('validating');
    setUsernameHelp('正在检查是否可用...');

    mockCheckUsernameAvailable(u).then((ok) => {
      if (cancelled) return;
      if (ok) {
        setUsernameStatus('ok');
        setUsernameHelp('用户名可用');
      } else {
        setUsernameStatus('error');
        setUsernameHelp('用户名已被占用（示例：admin/root/tommy/test）');
      }
    });

    // cleanup：当 debouncedUsername 变化时，忽略上一次校验结果
    return () => {
      cancelled = true;
    };
  }, [debouncedUsername]);

  useEffect(() => {
    const e = debouncedEmail.trim();

    if (!e) {
      setEmailStatus('idle');
      setEmailHelp('');
      return;
    }

    if (!validateEmailFormat(e)) {
      setEmailStatus('error');
      setEmailHelp('邮箱格式不正确');
      return;
    }

    setEmailStatus('ok');
    setEmailHelp('邮箱格式正确');
  }, [debouncedEmail]);

  const validateUsernameStatusMap = {
    idle: undefined,
    validating: 'validating',
    ok: 'success',
    error: 'error',
  } as const;

  const validateEmailStatusMap = {
    idle: undefined,
    ok: 'success',
    error: 'error',
  } as const;

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type="info"
        showIcon
        title="输入时即时更新 value；停止输入 400ms 后，使用 debouncedState 触发校验（本地 + 模拟远程）"
      />

      <Form form={form} layout="vertical">
        <Form.Item
          label="用户名"
          validateStatus={validateUsernameStatusMap[usernameStatus]}
          help={
            <Space size={8} style={{ marginBottom: 16 }}>
              <Typography.Text type={usernameStatus === 'error' ? 'danger' : 'secondary'}>
                {usernameHelp || ' '}
              </Typography.Text>
              {usernameExtraTip ? (
                <Typography.Text type="secondary">{usernameExtraTip}</Typography.Text>
              ) : null}
            </Space>
          }
        >
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例如：tommy / admin / yourname"
            allowClear
          />
        </Form.Item>

        <Form.Item
          label="邮箱"
          validateStatus={validateEmailStatusMap[emailStatus]}
          help={
            <Typography.Text type={emailStatus === 'error' ? 'danger' : 'secondary'}>
              {emailHelp || ' '}
              {emailControls.pending ? '（等待稳定...）' : ''}
            </Typography.Text>
          }
        >
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            allowClear
          />
        </Form.Item>
      </Form>

      <Flex gap="middle">
        <div>
          <Typography.Text type="secondary">debouncedUsername：</Typography.Text>
          <Typography.Text>{debouncedUsername || '-'}</Typography.Text>
        </div>

        <div>
          <Typography.Text type="secondary">debouncedEmail：</Typography.Text>
          <Typography.Text>{debouncedEmail || '-'}</Typography.Text>
        </div>
      </Flex>
    </Space>
  );
}
