/**
 * title: 基础用法
 * description: 默认为 boolean 切换，基础用法与 useBoolean 一致。
 */

import React from 'react'; // 这边导入 React 是因为 JSX 需要 React 作用域
import { Button } from 'antd';
import { useToggle } from 'tx-hooks';

export default () => {
  const [state, { toggle, setLeft, setRight, set }] = useToggle();

  return (
    <div>
      <p>Effects：{`${state}`}</p>
      <p>
        <Button onClick={toggle}>Toggle</Button>
        <Button onClick={setLeft} style={{ margin: '0 8px' }}>
          Toggle False
        </Button>
        <Button onClick={setRight}>Toggle True</Button>
        <Button onClick={() => set(Math.random() < 0.5)}>Toggle Random</Button>
      </p>
    </div>
  );
};
