/**
 * title: 基础用法
 * description: 用于 boolean 切换
 */

import React from 'react'; // 这边导入 React 是因为 JSX 需要 React 作用域
import { Button } from 'antd';
import { useBoolean } from 'tx-hooks';

export default () => {
  const [state, { toggle, setTrue, setFalse }] = useBoolean(false);

  return (
    <div>
      <p>Effects：{`${state}`}</p>
      <p>
        <Button onClick={toggle}>Toggle</Button>
        <Button onClick={setTrue} style={{ margin: '0 8px' }}>
          setTrue
        </Button>
        <Button onClick={setFalse}>setFalse</Button>
      </p>
    </div>
  );
};
