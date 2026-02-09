/**
 * title: 自动保存
 * description: 这边自动保存仅用作副作用函数。如果自动保存同时作用于多个事件，比如 change，blur，submit，组件 unmount 等，建议使用 useDebouncedCallback
 */
import React, { useEffect, useState } from 'react';
import { Alert, Input, Space, Typography, message } from 'antd';
import { useBoolean, useDebouncedEffect } from '@tx-labs/react-hooks';

export default function DemoAutoSave() {
  const [text, setText] = useState('');
  const [saving, savingActions] = useBoolean(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useDebouncedEffect(
    () => {
      savingActions.setTrue();

      // 模拟保存：执行后 600ms 写入并提示
      const timer = window.setTimeout(() => {
        // 模拟写入 localStorage / 请求保存
        localStorage.setItem('draft', text);
        savingActions.setFalse();
        setSavedAt(Date.now());
        message.success('已自动保存');
      }, 600);

      // cleanup：内容又变了就取消本次保存（避免多次写入）
      return () => {
        window.clearTimeout(timer);
        savingActions.setFalse();
      };
    },
    [text],
    {
      delay: 800,
      skipInitial: true, // 阻止页面初始化时直接触发副作用
    },
  );

  // 离开页面时清除在 localstorage 中的 draft 缓存
  useEffect(
    () => () => {
      localStorage.removeItem('draft');
    },
    [],
  );

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type="info"
        showIcon
        title="停止输入 800ms 后触发保存；保存过程 600ms，可被下一次输入取消（cleanup）"
      />

      <Input.TextArea
        rows={4}
        placeholder="输入一些内容..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <Space size={12}>
        <Typography.Text>状态：</Typography.Text>
        <Typography.Text type={saving ? 'warning' : 'secondary'}>
          {saving ? '保存中...' : '空闲'}
        </Typography.Text>

        <Typography.Text type="secondary">最近保存：</Typography.Text>
        <Typography.Text>{savedAt ? new Date(savedAt).toLocaleTimeString() : '-'}</Typography.Text>
      </Space>

      <Space size={12}>
        <Typography.Text>保存内容（可同步去 localStorage 查看）：</Typography.Text>
        <Typography.Text>{localStorage.getItem('draft') || '-'}</Typography.Text>
      </Space>
    </Space>
  );
}
