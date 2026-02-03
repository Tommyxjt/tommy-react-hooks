/**
 * title: 在任意两个值之间切换
 * description: 接受两个可选参数，在它们之间进行切换。
 */

import React from 'react';
import { Button } from 'antd';
import { useToggle } from 'tx-hooks';

export default () => {
  const [state, { toggle, setLeft, setRight, set }] = useToggle('Hello', 'World');

  return (
    <div>
      <p>Effects：{state}</p>
      <p>
        <Button onClick={toggle}>Toggle</Button>
        <Button onClick={() => set('Hello')} style={{ margin: '0 8px' }}>
          Set Hello
        </Button>
        <Button onClick={() => set('World')}>Set World</Button>
        <Button onClick={setLeft} style={{ margin: '0 8px' }}>
          Set Left
        </Button>
        <Button onClick={setRight}>Set Right</Button>
      </p>
    </div>
  );
};
