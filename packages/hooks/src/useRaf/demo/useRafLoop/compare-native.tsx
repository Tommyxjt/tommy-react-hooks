/**
 * title: 对照组：useRafLoop vs 原生 rAF（重复 start 的常见坑）
 * description: 做一个“重计算的循环动画”。原生 rAF（naive）如果重复 start 会叠加多个 loop，容易明显卡顿；useRafLoop 的 start 是幂等的。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Flex, Space, Statistic, Tag, Typography } from 'antd';
import { useRafLoop } from '@tx-labs/react-hooks';

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function busy(ms: number) {
  const s = now();
  while (now() - s < ms) {
    // busy loop (demo only)
  }
}

export default function DemoUseRafLoopCompareNative() {
  const TRACK = 320;
  const SPEED = 0.18; // px per ms

  const [workMs, setWorkMs] = useState(6);
  const workMsRef = useRef(workMs);
  workMsRef.current = workMs;

  // ---- useRafLoop group (idempotent start) ----
  const hookBoxRef = useRef<HTMLDivElement | null>(null);
  const hookXRef = useRef(0);
  const hookFramesRef = useRef(0);
  const hookDtRef = useRef(0);

  const hookLoop = useRafLoop(
    (dt) => {
      busy(workMsRef.current);
      hookFramesRef.current += 1;
      hookDtRef.current = dt;

      hookXRef.current = (hookXRef.current + dt * SPEED) % TRACK;
      if (hookBoxRef.current) {
        hookBoxRef.current.style.transform = `translateX(${hookXRef.current}px)`;
      }
    },
    { autoStart: false },
  );

  // ---- native rAF group (naive: repeated start stacks loops) ----
  const nativeBoxRef = useRef<HTMLDivElement | null>(null);
  const nativeXRef = useRef(0);
  const nativeFramesRef = useRef(0);
  const nativeDtRef = useRef(0);

  const nativeIdsRef = useRef<Set<number>>(new Set());

  const startNativeNaive = useCallback(() => {
    // ⚠️ naive：每点一次 start，就新开一条 rAF 链（会叠加多个 loop）
    let last = 0;
    let id = 0;

    const tick = (t: number) => {
      nativeIdsRef.current.delete(id);

      busy(workMsRef.current);
      nativeFramesRef.current += 1;

      const dt = last ? t - last : 0;
      last = t;
      nativeDtRef.current = dt;

      nativeXRef.current = (nativeXRef.current + dt * SPEED) % TRACK;
      if (nativeBoxRef.current) {
        nativeBoxRef.current.style.transform = `translateX(${nativeXRef.current}px)`;
      }

      id = requestAnimationFrame(tick);
      nativeIdsRef.current.add(id);
    };

    id = requestAnimationFrame(tick);
    nativeIdsRef.current.add(id);
  }, []);

  const stopNativeAll = useCallback(() => {
    for (const id of nativeIdsRef.current) cancelAnimationFrame(id);
    nativeIdsRef.current.clear();
  }, []);

  // ---- UI snapshot (avoid rerender every frame) ----
  const [snap, setSnap] = useState(() => ({
    hookFrames: 0,
    hookDt: 0,
    nativeFrames: 0,
    nativeDt: 0,
    nativeLoops: 0,
  }));

  useEffect(() => {
    const id = window.setInterval(() => {
      setSnap({
        hookFrames: hookFramesRef.current,
        hookDt: Math.round(hookDtRef.current),
        nativeFrames: nativeFramesRef.current,
        nativeDt: Math.round(nativeDtRef.current),
        nativeLoops: nativeIdsRef.current.size,
      });
    }, 200);

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      hookLoop.stop();
      stopNativeAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    hookLoop.stop();
    stopNativeAll();

    hookXRef.current = 0;
    nativeXRef.current = 0;
    hookFramesRef.current = 0;
    nativeFramesRef.current = 0;
    hookDtRef.current = 0;
    nativeDtRef.current = 0;

    if (hookBoxRef.current) hookBoxRef.current.style.transform = 'translateX(0px)';
    if (nativeBoxRef.current) nativeBoxRef.current.style.transform = 'translateX(0px)';
  };

  const startNativeX5 = () => {
    for (let i = 0; i < 5; i += 1) startNativeNaive();
  };

  const startHookX5 = () => {
    for (let i = 0; i < 5; i += 1) hookLoop.start();
  };

  return (
    <Card size="small" title="useRafLoop vs 原生 rAF（naive：重复 start 会叠加）">
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Alert
          showIcon
          type="warning"
          title="由于 useRafLoop 和原生 requestAnimationFrame 共用一个主线程，因此当原生 requestAnimationFrame 多开时卡顿会同步影响到 useRafLoop，这是正常现象"
        />
        <Flex gap={8} wrap="wrap" align="center">
          <Typography.Text>work:</Typography.Text>
          <Button type={workMs === 4 ? 'primary' : 'default'} onClick={() => setWorkMs(4)}>
            4ms
          </Button>
          <Button type={workMs === 6 ? 'primary' : 'default'} onClick={() => setWorkMs(6)}>
            6ms
          </Button>
          <Button type={workMs === 10 ? 'primary' : 'default'} onClick={() => setWorkMs(10)}>
            10ms
          </Button>
          <Tag color="default">（work 越大越容易卡）</Tag>

          <Button danger onClick={reset}>
            reset
          </Button>
        </Flex>

        <Flex gap={12} wrap="wrap">
          <Card size="small" title="useRafLoop（start 幂等）" style={{ flex: '1 1 360px' }}>
            <Space orientation="vertical" style={{ width: '100%' }} size={10}>
              <div
                style={{
                  position: 'relative',
                  width: TRACK,
                  height: 22,
                  border: '1px dashed #d9d9d9',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  ref={hookBoxRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 4,
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: '#1677ff',
                    transform: 'translateX(0px)',
                  }}
                />
              </div>

              <Flex gap={12} wrap="wrap">
                <Statistic title="frames" value={snap.hookFrames} />
                <Statistic title="last dt(ms)" value={snap.hookDt} />
                <Statistic title="running" value={hookLoop.running ? 'true' : 'false'} />
              </Flex>

              <Space wrap>
                <Button onClick={hookLoop.start}>start</Button>
                <Button onClick={hookLoop.stop}>stop</Button>
                <Button onClick={startHookX5}>start x5（仍只 1 条 loop）</Button>
              </Space>
            </Space>
          </Card>

          <Card
            size="small"
            title="原生 rAF（naive：重复 start 会叠加）"
            style={{ flex: '1 1 360px' }}
          >
            <Space orientation="vertical" style={{ width: '100%' }} size={10}>
              <div
                style={{
                  position: 'relative',
                  width: TRACK,
                  height: 22,
                  border: '1px dashed #d9d9d9',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  ref={nativeBoxRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 4,
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: '#ff4d4f',
                    transform: 'translateX(0px)',
                  }}
                />
              </div>

              <Flex gap={12} wrap="wrap">
                <Statistic title="frames" value={snap.nativeFrames} />
                <Statistic title="last dt(ms)" value={snap.nativeDt} />
                <Statistic title="active loops" value={snap.nativeLoops} />
              </Flex>

              <Space wrap>
                <Button onClick={startNativeNaive}>start（naive）</Button>
                <Button onClick={stopNativeAll}>stopAll</Button>
                <Button onClick={startNativeX5}>start x5（会叠加）</Button>
              </Space>

              <Typography.Text type="secondary">
                提示：把 work 调到 6~10ms，再点 “start x5”，会非常明显地卡（因为同一时间有多条 loop
                在跑）。
              </Typography.Text>
            </Space>
          </Card>
        </Flex>
      </Space>
    </Card>
  );
}
