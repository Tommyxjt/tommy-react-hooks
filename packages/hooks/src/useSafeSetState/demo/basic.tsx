/**
 * title: 基础用法
 * description: 正常 setState；组件卸载后异步回调仍会触发，但 setState 会被安全忽略
 */
import React, { useRef } from 'react';
import { Alert, Button, Space, Typography, message } from 'antd';
import { useBoolean, useSafeSetState } from '@tx-labs/react-hooks';

function Child() {
  const [count, setCount] = useSafeSetState(0);
  const timerRef = useRef<number | null>(null);

  const increaseAsync = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);

    message.info('已安排：1s 后尝试 setState（如果你在此期间卸载组件，将被安全忽略）');

    // 刻意不在卸载时清理：模拟 “不可取消的异步回调”
    timerRef.current = window.setTimeout(() => {
      message.info('异步回调触发：尝试 setState');
      setCount((c) => c + 1);
      timerRef.current = null;
    }, 1000);
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Typography.Text>子组件 count：{count}</Typography.Text>
      <Button onClick={increaseAsync}>1s 后 +1（模拟异步回调）</Button>
    </Space>
  );
}

export default function DemoUseSafeSetStateBasic() {
  const [mounted, { toggle }] = useBoolean(true);

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type="info"
        showIcon
        title="操作：点击 “1s 后 +1”，然后立刻卸载子组件。1s 后回调仍会触发（会弹 message），但不会更新已卸载组件的状态，也不会产生 React 警告。"
      />

      <Button danger={mounted} onClick={toggle}>
        {mounted ? '卸载子组件' : '挂载子组件'}
      </Button>

      {mounted ? <Child /> : <Typography.Text type="secondary">子组件已卸载</Typography.Text>}
    </Space>
  );
}
