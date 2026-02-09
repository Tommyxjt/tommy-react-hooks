/**
 * title: 基础用法
 * description: 用于 boolean 切换
 */

import React from 'react'; // 这边导入 React 是因为 JSX 需要 React 作用域
import { Button } from 'antd';
import { useBoolean } from '@tx-labs/react-hooks';

export default () => {
  const [state, { toggle, setTrue, setFalse }] = useBoolean(false);

  return (
    <div>
      <p>Effects：{`${state}`}</p>
      <p style={{ display: 'flex', gap: 8 }}>
        <Button onClick={toggle}>Toggle</Button>
        <Button onClick={setTrue}>Set True</Button>
        <Button onClick={setFalse}>Set False</Button>
      </p>
    </div>
  );
};
