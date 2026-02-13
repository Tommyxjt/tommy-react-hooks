/**
 * title: 对照组：useState vs useRafState（可调订阅频率 + 可调 maxFps）
 * description: 用 Slider 调“行情订阅频率(Hz)”和“useRafState 的 maxFps”，直观看到什么时候合并提交才有收益。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Flex, Slider, Space, Statistic, Tag, Typography } from 'antd';
import { useRafState } from '@tx-labs/react-hooks';

interface Tick {
  t: number;
  price: number;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function useCommitsPerSecond<T>(value: T) {
  const commitsRef = useRef(0);
  const lastRef = useRef(value);
  const [cps, setCps] = useState(0);

  useEffect(() => {
    if (!Object.is(lastRef.current, value)) {
      commitsRef.current += 1;
      lastRef.current = value;
    }
  }, [value]);

  useEffect(() => {
    let last = commitsRef.current;
    const id = window.setInterval(() => {
      const cur = commitsRef.current;
      setCps(cur - last);
      last = cur;
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return cps;
}

function useRafFps() {
  const [fps, setFps] = useState(0);
  const countRef = useRef(0);

  useEffect(() => {
    let rafId = 0;

    const loop = () => {
      countRef.current += 1;
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    const id = window.setInterval(() => {
      setFps(countRef.current);
      countRef.current = 0;
    }, 1000);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearInterval(id);
    };
  }, []);

  return fps;
}

function useMockTicker(intervalMs: number) {
  const listenersRef = useRef(new Set<(tick: Tick) => void>());
  const ticksRef = useRef(0);
  const [tps, setTps] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTps(ticksRef.current);
      ticksRef.current = 0;
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let price = 100 + Math.random() * 10;

    const timer = window.setInterval(() => {
      price = Math.max(0.01, price + (Math.random() - 0.5) * 0.2);
      const tick: Tick = { t: now(), price };

      ticksRef.current += 1;
      listenersRef.current.forEach((fn) => fn(tick));
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs]);

  const subscribe = useCallback((fn: (tick: Tick) => void) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  return { subscribe, tps };
}

function Panel(props: {
  title: string;
  symbol: string;
  tick: Tick | null;
  tps: number;
  cps: number;
  cap: number | null;
}) {
  const saved = Math.max(0, props.tps - props.cps);

  return (
    <Card size="small" title={props.title} style={{ flex: '1 1 420px' }}>
      <Space orientation="vertical" style={{ width: '100%' }} size={10}>
        <Flex gap={8} wrap="wrap" align="center">
          <Tag>{props.symbol}</Tag>
          <Tag>ticks/s: {props.tps}</Tag>
          <Tag>commits/s: {props.cps}</Tag>
          <Tag>saved: {saved}</Tag>
          <Tag>cap: {props.cap == null ? '-' : props.cap}</Tag>
        </Flex>

        <Flex gap={12} wrap="wrap">
          <Statistic title="Last" value={props.tick?.price ?? 0} precision={3} />
          <Statistic title="Time" value={props.tick ? Math.round(props.tick.t) : 0} />
        </Flex>

        <Typography.Text type="secondary">
          commits/s = “tick 这份 state 真正提交到 React 的次数”。saved 越大，说明合并收益越明显。
        </Typography.Text>
      </Space>
    </Card>
  );
}

export default function DemoUseRafStateMarketSliders() {
  const rafFps = useRafFps();

  const [intervalMs, setIntervalMs] = useState(10);
  const [maxFps, setMaxFps] = useState<number>(0);

  const { subscribe, tps } = useMockTicker(intervalMs);

  const [tickNaive, setTickNaive] = useState<Tick | null>(null);

  const rafOptions = useMemo(() => ({ maxFps: maxFps > 0 ? maxFps : undefined }), [maxFps]);
  const [tickRaf, setTickRaf] = useRafState<Tick | null>(null, rafOptions);

  useEffect(() => {
    return subscribe((tick) => {
      setTickNaive(tick);
      setTickRaf(tick);
    });
  }, [subscribe, setTickRaf]);

  const naiveCps = useCommitsPerSecond(tickNaive);
  const rafCps = useCommitsPerSecond(tickRaf);

  const cap = maxFps > 0 ? maxFps : rafFps || null;

  const theoreticalHz = Math.round(1000 / Math.max(1, intervalMs));

  // 只保留两种状态：收益明显（绿）/收益不明显（红）
  const isClearlyUseful = cap != null && tps >= cap * 1.5;

  const alertType: 'success' | 'error' = isClearlyUseful ? 'success' : 'error';
  const alertMsg = isClearlyUseful
    ? '收益明显：useRafState 更合适'
    : '收益不明显：普通 useState 往往就够了';
  const alertDesc = isClearlyUseful
    ? 'ticks/s 明显高于 cap（≈ rAF fps 或 maxFps）：useRafState 会把提交合并到每帧（或每 maxFps）最多一次，显著降低 commits/s。'
    : 'ticks/s 没有明显超过 cap：同帧合并空间很小。此时 useRafState 往往不会减少 commits（可能还会引入额外开销），用普通 useState 更简单。';

  return (
    <Card size="small" title="useRafState - 实时行情对照（可调订阅频率 + maxFps）">
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Flex gap={8} wrap="wrap" align="center">
          <Tag>rAF fps(估算): {rafFps || '-'}</Tag>
          <Tag>
            interval: {intervalMs}ms（理论 {theoreticalHz}Hz）
          </Tag>
          <Tag>maxFps: {maxFps === 0 ? '∞(跟随rAF)' : `${maxFps}`}</Tag>
          <Tag>cap: {cap == null ? '-' : cap}</Tag>
          <Typography.Text type="secondary">
            显示器刷新率会影响 rAF fps：120/144Hz 屏 cap 更高 → 同样的 tick
            频率更可能“看起来没差异”。
          </Typography.Text>
        </Flex>

        <Alert type={alertType} showIcon title={alertMsg} description={alertDesc} />

        <Space orientation="vertical" style={{ width: '100%' }} size={4}>
          <Typography.Text>订阅频率（intervalMs）：{intervalMs}ms</Typography.Text>
          <Slider
            min={1}
            max={50}
            step={1}
            value={intervalMs}
            onChange={(v) => setIntervalMs(v as number)}
            marks={{ 1: '1', 2: '2', 5: '5', 10: '10', 16: '16', 33: '33', 50: '50' }}
            tooltip={{
              formatter: (v) => `${v}ms (~${Math.round(1000 / Math.max(1, Number(v)))}Hz)`,
            }}
          />

          <Typography.Text>
            useRafState 限速（maxFps）：{maxFps === 0 ? '不限制' : `${maxFps}fps`}
          </Typography.Text>
          <Slider
            min={0}
            max={120}
            step={5}
            value={maxFps}
            onChange={(v) => setMaxFps(v as number)}
            marks={{ 0: '∞', 30: '30', 60: '60', 90: '90', 120: '120' }}
            tooltip={{ formatter: (v) => (Number(v) === 0 ? '∞(跟随rAF)' : `${v}fps`) }}
          />

          <Typography.Text type="secondary">
            规律：ticks/s ≫ cap 才能明显省 commits。高刷新率显示器 cap
            更高，因此更不容易“合并出差异”。
          </Typography.Text>
        </Space>

        <Flex gap={12} wrap="wrap">
          <Panel
            title="naive：useState"
            symbol="ACME"
            tick={tickNaive}
            tps={tps}
            cps={naiveCps}
            cap={cap}
          />
          <Panel
            title="raf：useRafState（按帧合并 + 可选 maxFps）"
            symbol="ACME"
            tick={tickRaf}
            tps={tps}
            cps={rafCps}
            cap={cap}
          />
        </Flex>
      </Space>
    </Card>
  );
}
