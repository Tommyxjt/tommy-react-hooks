/**
 * title: 对照实验：useRaf(takeLatest) vs 原生 requestAnimationFrame(naive)
 * description: 同一份高频输入（pointermove）同时驱动两种实现。通过“放大倍率”制造同帧多次 schedule，让 takeLatest 的优势直观可见。
 */
import React, { PointerEvent, useEffect, useRef, useState } from 'react';
import { Button, Card, Flex, Space, Statistic, Tag, Typography } from 'antd';
import { useRaf } from '@tx-labs/react-hooks';

interface Point {
  x: number;
  y: number;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function safeBounds(size: number, r: number) {
  const min = r;
  const max = Math.max(r, size - r);
  return { min, max };
}

export default function DemoUseRafVsNativeRaf() {
  const DOT = 10;
  const R = DOT / 2;

  // 放大倍率：每次 pointermove 内部同步 schedule N 次（用于把差距拉开，便于观察）
  const [amplify, setAmplify] = useState<1 | 5 | 20>(1);

  // shared input counter
  const inputCountRef = useRef(0);

  // ----- useRaf group (takeLatest) -----
  const hookPosRef = useRef<Point>({ x: R, y: R });
  const hookScheduledRef = useRef(0);
  const hookInvokedRef = useRef(0);

  const raf = useRaf((x: number, y: number) => {
    hookPosRef.current = { x, y };
    hookInvokedRef.current += 1;
  });

  const scheduleHook = (x: number, y: number) => {
    hookScheduledRef.current += 1;
    raf(x, y);
  };

  // ----- native rAF group (naive：每次都 request，不合并) -----
  const nativePosRef = useRef<Point>({ x: R, y: R });
  const nativeScheduledRef = useRef(0);
  const nativeInvokedRef = useRef(0);

  const nativeLatestRef = useRef<Point>({ x: R, y: R });
  const nativePendingIdsRef = useRef<Set<number>>(new Set());

  const scheduleNative = (x: number, y: number) => {
    nativeScheduledRef.current += 1;

    nativeLatestRef.current = { x, y };

    // naive：每次都 requestAnimationFrame（不合并、不 cancel）
    let id = 0;
    id = requestAnimationFrame(() => {
      nativeInvokedRef.current += 1;
      nativePosRef.current = { x, y };
      nativePendingIdsRef.current.delete(id);
    });

    nativePendingIdsRef.current.add(id);
  };

  const cancelNative = () => {
    const ids = Array.from(nativePendingIdsRef.current);
    ids.forEach((id) => cancelAnimationFrame(id));
    nativePendingIdsRef.current.clear();
  };

  // ----- pointer box -----
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    inputCountRef.current += 1;

    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();

    const bx = safeBounds(rect.width, R);
    const by = safeBounds(rect.height, R);

    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const x = Math.round(clamp(rawX, bx.min, bx.max));
    const y = Math.round(clamp(rawY, by.min, by.max));

    // 关键：制造“同帧多次 schedule”
    for (let i = 0; i < amplify; i += 1) {
      scheduleHook(x, y);
      scheduleNative(x, y);
    }
  };

  // ----- view state (update at most once per frame) -----
  const [view, setView] = useState(() => ({
    input: 0,
    hook: { x: R, y: R, scheduled: 0, invoked: 0, pending: false },
    native: { x: R, y: R, scheduled: 0, invoked: 0, pending: false },
  }));

  const lastSnapRef = useRef<string>('');

  useEffect(() => {
    let id = 0;

    const tick = () => {
      const snap = {
        input: inputCountRef.current,
        hook: {
          x: hookPosRef.current.x,
          y: hookPosRef.current.y,
          scheduled: hookScheduledRef.current,
          invoked: hookInvokedRef.current,
          pending: raf.isPending(),
        },
        native: {
          x: nativePosRef.current.x,
          y: nativePosRef.current.y,
          scheduled: nativeScheduledRef.current,
          invoked: nativeInvokedRef.current,
          pending: nativePendingIdsRef.current.size > 0,
        },
      };

      const key = JSON.stringify(snap);
      if (key !== lastSnapRef.current) {
        lastSnapRef.current = key;
        setView(snap);
      }

      id = requestAnimationFrame(tick);
    };

    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savedHook = Math.max(0, view.hook.scheduled - view.hook.invoked);
  const savedNative = Math.max(0, view.native.scheduled - view.native.invoked);

  const reset = () => {
    inputCountRef.current = 0;

    hookScheduledRef.current = 0;
    hookInvokedRef.current = 0;
    hookPosRef.current = { x: R, y: R };
    raf.cancel();

    nativeScheduledRef.current = 0;
    nativeInvokedRef.current = 0;
    nativePosRef.current = { x: R, y: R };
    nativeLatestRef.current = { x: R, y: R };
    cancelNative();
  };

  const syncFire200 = () => {
    // 同一 tick 内同步触发 200 次：
    // - useRaf：同帧合并，下一帧只 invoke 1 次
    // - naive rAF：下一帧会 invoke 200 次
    for (let i = 1; i <= 200; i += 1) {
      scheduleHook(i, i);
      scheduleNative(i, i);
    }
  };

  return (
    <Card size="small" title="useRaf vs 原生 rAF（对照组）">
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Flex gap={8} wrap="wrap" align="center">
          <Button onClick={syncFire200}>同步触发 200 次（同帧）</Button>
          <Button danger onClick={reset}>
            reset
          </Button>

          <Tag>input events: {view.input}</Tag>

          <Space size={6}>
            <Typography.Text>放大倍率：</Typography.Text>
            <Button type={amplify === 1 ? 'primary' : 'default'} onClick={() => setAmplify(1)}>
              x1
            </Button>
            <Button type={amplify === 5 ? 'primary' : 'default'} onClick={() => setAmplify(5)}>
              x5
            </Button>
            <Button type={amplify === 20 ? 'primary' : 'default'} onClick={() => setAmplify(20)}>
              x20
            </Button>
          </Space>
        </Flex>

        <div
          onPointerMove={onPointerMove}
          style={{
            position: 'relative',
            height: 220,
            border: '1px dashed #d9d9d9',
            borderRadius: 8,
            userSelect: 'none',
            overflow: 'hidden',
          }}
        >
          {/* useRaf dot */}
          <div
            style={{
              position: 'absolute',
              left: view.hook.x,
              top: view.hook.y,
              width: DOT,
              height: DOT,
              borderRadius: 999,
              transform: 'translate(-50%, -50%) translateX(-6px)',
              background: '#1677ff',
            }}
          />

          {/* native dot */}
          <div
            style={{
              position: 'absolute',
              left: view.native.x,
              top: view.native.y,
              width: DOT,
              height: DOT,
              borderRadius: 999,
              transform: 'translate(-50%, -50%) translateX(6px)',
              background: '#ff4d4f',
            }}
          />

          <div style={{ position: 'absolute', left: 12, top: 10 }}>
            <Tag color="blue">useRaf</Tag>
            <Tag color="red">native rAF</Tag>
            <Tag>在框内移动鼠标/触控笔</Tag>
            <Tag>amplify x{amplify}</Tag>
          </div>
        </div>

        <Flex gap={12} wrap="wrap">
          <Card size="small" title="useRaf（takeLatest / 同帧合并）" style={{ flex: '1 1 360px' }}>
            <Flex gap={12} wrap="wrap">
              <Statistic title="committed x" value={view.hook.x} />
              <Statistic title="committed y" value={view.hook.y} />
              <Statistic title="scheduled" value={view.hook.scheduled} />
              <Statistic title="invoked" value={view.hook.invoked} />
              <Statistic title="saved" value={savedHook} />
              <Statistic title="pending" value={view.hook.pending ? 'true' : 'false'} />
            </Flex>
            <Typography.Text type="secondary">
              同一帧内多次调用会合并为下一帧只执行一次（takeLatest）。
            </Typography.Text>
          </Card>

          <Card
            size="small"
            title="原生 rAF（naive：每次都 request）"
            style={{ flex: '1 1 360px' }}
          >
            <Flex gap={12} wrap="wrap">
              <Statistic title="committed x" value={view.native.x} />
              <Statistic title="committed y" value={view.native.y} />
              <Statistic title="scheduled" value={view.native.scheduled} />
              <Statistic title="invoked" value={view.native.invoked} />
              <Statistic title="saved" value={savedNative} />
              <Statistic title="pending" value={view.native.pending ? 'true' : 'false'} />
            </Flex>
            <Typography.Text type="secondary">
              同一帧内多次调用会创建多个回调，下一帧会执行多次（浪费执行次数）。
            </Typography.Text>
          </Card>
        </Flex>

        <Typography.Text type="secondary">
          建议观察：把“放大倍率”切到 x20，或点一次“同步触发 200 次”。这时 useRaf 的 invoked
          增长会明显慢很多， 而 naive rAF 的 invoked 会跟 scheduled 一起飙升。
        </Typography.Text>
      </Space>
    </Card>
  );
}
