/**
 * title: 基础用法（秒表：HH:MM:SS.mmmuuu）
 * description: start/stop/reset 控制一个按帧更新的秒表；展示到“毫秒+微秒(≈)”（基于 performance.now 的小数部分）。
 */
import React, { useRef, useState } from 'react';
import { Button, Card, Space, Statistic, Tag } from 'antd';
import { useRafLoop } from '@tx-labs/react-hooks';

function pad(n: number, len: number) {
  return String(n).padStart(len, '0');
}

function formatHHMMSSmmmuuu(totalUs: number) {
  const us = Math.max(0, Math.floor(totalUs));
  const totalMs = Math.floor(us / 1000);
  const totalSec = Math.floor(totalMs / 1000);

  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;

  const mmm = totalMs % 1000;
  const uuu = us % 1000;

  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}.${pad(mmm, 3)}${pad(uuu, 3)}`;
}

export default function DemoUseRafLoopStopwatch() {
  const elapsedUsRef = useRef(0);
  const [elapsedUs, setElapsedUs] = useState(0);

  const loop = useRafLoop(
    (deltaMs) => {
      elapsedUsRef.current += deltaMs * 1000;
      setElapsedUs(elapsedUsRef.current);
    },
    { autoStart: false },
  );

  const start = () => loop.start();
  const stop = () => loop.stop();
  const toggle = () => loop.toggle();
  const reset = () => {
    loop.stop();
    elapsedUsRef.current = 0;
    setElapsedUs(0);
  };

  return (
    <Card size="small" title="useRafLoop - 秒表">
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Space wrap align="center">
          <Statistic title="elapsed" value={formatHHMMSSmmmuuu(elapsedUs)} style={{ width: 200 }} />
          <Tag color={loop.running ? 'processing' : 'default'}>
            {loop.running ? 'running' : 'stopped'}
          </Tag>
        </Space>

        <Space wrap>
          <Button type="primary" onClick={start}>
            start
          </Button>
          <Button danger onClick={stop}>
            stop
          </Button>
          <Button onClick={toggle}>toggle</Button>
          <Button onClick={reset}>reset</Button>
        </Space>
      </Space>
    </Card>
  );
}
