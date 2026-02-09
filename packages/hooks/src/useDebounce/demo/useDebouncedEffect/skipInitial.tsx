/**
 * title: 启用 skipInitial
 * description: skipInitial=true 时：页面初始化副作用不会触发；后续 value 变化才触发（停下来 500ms）
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, InputNumber, Space, Switch, Typography } from 'antd';
import { useDebouncedEffect } from '@tx-labs/react-hooks';
import { useLocation } from 'dumi';

export default function DemoSkipInitial() {
  const { pathname } = useLocation();
  const [value, setValue] = useState<number>(10);
  const [skipInitial, setSkipInitial] = useState(localStorage.getItem('skipInitial') !== 'false');
  const [times, setTimes] = useState(0);

  const baseKey = useMemo(() => pathname, [pathname]);

  useDebouncedEffect(
    () => {
      setTimes((t) => t + 1);
    },
    [value, skipInitial],
    { delay: 500, skipInitial },
  );

  useEffect(() => {
    localStorage.setItem('skipInitial', String(skipInitial));
  }, [skipInitial]);

  // 只有离开页面时才清空 localStorage 中的 skipInitial
  // 刷新或者页内锚点跳转不触发 cleanup
  useEffect(
    () => () => {
      localStorage.removeItem('skipInitial');
    },
    [baseKey],
  );

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type="info"
        showIcon
        title="关闭 skipInitial 后刷新页面，观察触发次数与开启 skipInitial 的区别"
      />

      <Space align="center" size={12}>
        <Typography.Text>skipInitial</Typography.Text>
        <Switch checked={skipInitial} onChange={setSkipInitial} />
      </Space>

      <Space align="center" size={12}>
        <Typography.Text>value：</Typography.Text>
        <InputNumber value={value} onChange={(v) => setValue(Number(v))} />
        <Typography.Text type="secondary">（快速改动，观察触发次数）</Typography.Text>
      </Space>

      <Space size={12}>
        <Typography.Text>触发次数：</Typography.Text>
        <Typography.Text strong>{times}</Typography.Text>
      </Space>
    </Space>
  );
}
