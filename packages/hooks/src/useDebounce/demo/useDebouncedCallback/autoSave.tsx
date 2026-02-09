/**
 * title: 自动保存（体现 cancel / flush / pending）
 * description: onChange 频繁触发只保存最后一次；onBlur 会 flush 立刻保存；cancel 仅取消待保存；clear 会 cancel 并清空已保存
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Space, Typography, message } from 'antd';
import { useDebouncedCallback } from '@tx-labs/react-hooks';

function safeGet(key: string) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeSet(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {
    // ignore
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export default function DemoAutoSave() {
  const storageKey = 'debounced-callback-draft';

  const [text, setText] = useState<string>(() => safeGet(storageKey));
  const [savedValue, setSavedValue] = useState<string>(() => safeGet(storageKey));
  const [scheduledValue, setScheduledValue] = useState<string>(''); // 最后一次“待保存”的内容
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 避免：点击按钮导致 blur，从而误触发 onBlur flush
  const suppressNextBlurFlushRef = useRef(false);

  const [saveDraft, actions] = useDebouncedCallback(
    (nextText: string) => {
      safeSet(storageKey, nextText);
      setSavedValue(nextText);
      setSavedAt(Date.now());
      message.success('已自动保存（仅保存最后一次）');
    },
    { delay: 3000 },
  );

  const tip = useMemo(() => {
    return '输入时频繁触发，但只保存最后一次（3000ms）；失焦会 flush 立刻保存；cancel 只取消待保存不落库；clear 会 cancel 并清空已保存。';
  }, []);

  const markSuppressBlurFlush = () => {
    suppressNextBlurFlushRef.current = true;
    window.setTimeout(() => {
      suppressNextBlurFlushRef.current = false;
    }, 0);
  };

  const onChange = (v: string) => {
    setText(v);
    setScheduledValue(v); // 用于展示“待保存内容”
    saveDraft(v); // 防抖：只会在停止输入 3000ms 后执行最后一次
  };

  const onBlur = () => {
    // 失焦 flush：体现 flush 的价值（离开输入框前确保落库）
    if (suppressNextBlurFlushRef.current) return;
    if (actions.pending) {
      actions.flush();
      message.info('输入框失焦：已 flush，确保最新内容保存');
    }
  };

  const onFlush = () => {
    actions.flush();
    message.info('手动 flush：立刻保存最后一次待保存内容');
  };

  const onCancel = () => {
    actions.cancel();
    message.info('已 cancel：取消待保存调用（不会写入 localStorage）');
  };

  const onClear = () => {
    actions.cancel(); // 先取消待保存，避免“过会又把旧内容写回去”
    setText('');
    setScheduledValue('');
    safeRemove(storageKey);
    setSavedValue('');
    setSavedAt(null);
    message.info('已清空：取消待保存并清除已保存内容');
  };

  const onRestoreSaved = () => {
    const v = safeGet(storageKey);
    setText(v);
    message.info('已恢复为“已保存内容”');
  };

  // 离开页面时清除在 localstorage 中的 draft 缓存
  useEffect(
    () => () => {
      localStorage.removeItem(storageKey);
    },
    [],
  );

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert type="info" showIcon title={tip} />

      <Input.TextArea
        rows={4}
        placeholder="输入一些内容...（停止输入 3000ms 后自动保存最后一次；失焦会 flush）"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />

      <Space size={12} wrap>
        <Button
          type="primary"
          onMouseDown={markSuppressBlurFlush}
          onClick={onFlush}
          disabled={!actions.pending}
        >
          flush（立刻保存）
        </Button>

        <Button onMouseDown={markSuppressBlurFlush} onClick={onCancel} disabled={!actions.pending}>
          cancel（取消待保存）
        </Button>

        <Button onMouseDown={markSuppressBlurFlush} onClick={onRestoreSaved}>
          恢复为已保存内容
        </Button>

        <Button danger onMouseDown={markSuppressBlurFlush} onClick={onClear}>
          clear（清空并不保存）
        </Button>
      </Space>

      <Space size={12} wrap>
        <Typography.Text>pending：</Typography.Text>
        <Typography.Text type={actions.pending ? 'warning' : 'secondary'}>
          {actions.pending ? 'true（有待保存）' : 'false（空闲）'}
        </Typography.Text>

        <Typography.Text type="secondary">最近保存：</Typography.Text>
        <Typography.Text>{savedAt ? new Date(savedAt).toLocaleTimeString() : '-'}</Typography.Text>
      </Space>

      <Space orientation="vertical" style={{ width: '100%' }} size={6}>
        <Typography.Text type="secondary">最后一次待保存内容（scheduledValue）：</Typography.Text>
        <Typography.Text>{scheduledValue || '-'}</Typography.Text>

        <Typography.Text type="secondary">
          已保存内容（savedValue / localStorage）：
        </Typography.Text>
        <Typography.Text>{savedValue || '-'}</Typography.Text>
      </Space>

      <Typography.Text type="secondary">
        观察点：快速输入一串文字后停下来，应该只会保存最后一次；输入后立刻点 cancel →
        不保存；输入后失焦或点 flush → 立刻保存。
      </Typography.Text>
    </Space>
  );
}
