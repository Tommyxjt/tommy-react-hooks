/**
 * title: 对照组 原生 raf vs useRafThrottledEffect
 * description: 正常使用差异不大，只有做重开销 —— “重计算 + 重渲染” 的场景时才可能拉开差距。这个场景计算量还是不够重。
 */

import React, {
  PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button, Card, Flex, Slider, Space, Switch, Tag, Typography } from 'antd';
import { useRafThrottledEffect } from '@tx-labs/react-hooks';

interface Point {
  x: number;
  y: number;
}
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const PAD = 10;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rectFrom(a: Point, b: Point): Rect & { width: number; height: number } {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function intersect(a: Rect, b: Rect) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function computeGridLayout(args: { w: number; h: number; count: number }) {
  const { w, h, count } = args;

  let gap = 5;
  if (count >= 1400) gap = 2;
  else if (count >= 900) gap = 3;

  const aspect = w / Math.max(1, h);

  let cols = Math.ceil(Math.sqrt(count * aspect));
  cols = Math.max(10, Math.min(90, cols));

  const rows = Math.ceil(count / cols);

  const cellW = (w - gap * (cols - 1)) / cols;
  const cellH = (h - gap * (rows - 1)) / rows;

  const cell = Math.floor(Math.max(6, Math.min(cellW, cellH)));

  return { cols, rows, cell, gap };
}

export default function DemoUseRafThrottledEffectCoalesced_SelectedIdsState() {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 对照开关：naive（每个采样点都重算 + setState） vs raf（同帧合并 takeLatest）
  const [useRaf, setUseRaf] = useState(true);

  // 元素数量
  const [count, setCount] = useState(1000);

  // 鼠标环境可能看不到 coalesced，多点用 slider 放大（模拟“一次 move 有多个采样点”）
  const [simulateK, setSimulateK] = useState(1);

  // 真实场景：把命中结果 selectedIds 放进 React state（列表/侧边栏/属性面板会用）
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // layout
  const [layout, setLayout] = useState(() => ({ cols: 20, rows: 40, cell: 12, gap: 5 }));

  // item refs/cache
  const itemElsRef = useRef<Array<HTMLDivElement | null>>([]);
  const itemRectsRef = useRef<Rect[]>([]);
  const prevHitRef = useRef<boolean[]>([]);

  // drag state (local coords)
  const draggingRef = useRef(false);
  const startLocalRef = useRef<Point | null>(null);

  // 最新选区（local）——raf 提交只看它（takeLatest）
  const latestSelRef = useRef<(Rect & { width: number; height: number }) | null>(null);

  // stats
  const movesRef = useRef(0);
  const pointsRef = useRef(0);
  const runCallsRef = useRef(0);
  const commitsRef = useRef(0);
  const costRef = useRef(0);

  const [movesPerSec, setMovesPerSec] = useState(0);
  const [pointsPerSec, setPointsPerSec] = useState(0);
  const [runsPerSec, setRunsPerSec] = useState(0);
  const [commitsPerSec, setCommitsPerSec] = useState(0);
  const [avgCost, setAvgCost] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMovesPerSec(movesRef.current);
      setPointsPerSec(pointsRef.current);
      setRunsPerSec(runCallsRef.current);
      setCommitsPerSec(commitsRef.current);
      setAvgCost(commitsRef.current ? costRef.current / commitsRef.current : 0);

      movesRef.current = 0;
      pointsRef.current = 0;
      runCallsRef.current = 0;
      commitsRef.current = 0;
      costRef.current = 0;
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // resize/layout
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setLayout(computeGridLayout({ w: r.width - 2 * PAD, h: r.height - 2 * PAD, count }));
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);

  const buildCache = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;

    const r = area.getBoundingClientRect();
    const rects: Rect[] = [];
    const prev: boolean[] = [];

    for (let i = 0; i < count; i += 1) {
      const el = itemElsRef.current[i];
      if (!el) continue;

      const er = el.getBoundingClientRect();
      // 与 local 坐标系对齐：减掉容器 padding
      rects[i] = {
        left: er.left - r.left - PAD,
        top: er.top - r.top - PAD,
        right: er.right - r.left - PAD,
        bottom: er.bottom - r.top - PAD,
      };
      prev[i] = false;
      el.style.outline = 'none';
    }

    itemRectsRef.current = rects;
    prevHitRef.current = prev;
  }, [count]);

  const paintSelectionBox = useCallback((sel: Rect & { width: number; height: number }) => {
    const box = boxRef.current;
    if (!box) return;
    box.style.display = 'block';
    box.style.transform = `translate(${sel.left}px, ${sel.top}px)`;
    box.style.width = `${sel.width}px`;
    box.style.height = `${sel.height}px`;
  }, []);

  const getLocalPoint = (clientX: number, clientY: number) => {
    const area = areaRef.current;
    if (!area) return null;

    const r = area.getBoundingClientRect();
    const w = Math.max(0, r.width - 2 * PAD);
    const h = Math.max(0, r.height - 2 * PAD);

    return {
      x: clamp(clientX - r.left - PAD, 0, w),
      y: clamp(clientY - r.top - PAD, 0, h),
    };
  };

  const getSamples = (e: PointerEvent<HTMLDivElement>) => {
    const raw =
      typeof (e as any).getCoalescedEvents === 'function'
        ? ((e as any).getCoalescedEvents() as Array<{ clientX: number; clientY: number }>)
        : null;

    if (raw && raw.length > 0) return raw;

    const k = Math.max(1, simulateK);
    if (k === 1) return [{ clientX: e.clientX, clientY: e.clientY }];

    // demo：重复当前点 k 次，用于放大“每点都算 + setState”的差异
    return Array.from({ length: k }).map(() => ({ clientX: e.clientX, clientY: e.clientY }));
  };

  // 重活：命中检测 + 生成 selectedIds + setState（真实业务：侧边栏/属性面板等依赖它）
  const commitHitTest = useCallback(() => {
    const sel = latestSelRef.current;
    if (!sel) return;

    if (!itemRectsRef.current.length) buildCache();

    const t0 = now();

    const rects = itemRectsRef.current;
    const prev = prevHitRef.current;

    const outline =
      layout.cell <= 10 ? '1px solid rgba(22,119,255,0.9)' : '2px solid rgba(22,119,255,0.9)';

    const ids: number[] = [];

    for (let i = 0; i < count; i += 1) {
      const el = itemElsRef.current[i];
      const r = rects[i];
      if (!el || !r) continue;

      const ok = intersect(sel, r);
      if (ok) ids.push(i);

      if (prev[i] !== ok) {
        prev[i] = ok;
        el.style.outline = ok ? outline : 'none';
      }
    }

    // 把命中列表放进 React state（这就是“重”的来源之一）
    setSelectedIds(ids);

    const t1 = now();
    commitsRef.current += 1;
    costRef.current += t1 - t0;
  }, [buildCache, count, layout.cell]);

  const fx = useRafThrottledEffect(() => {
    commitHitTest();
  }, []);

  const scheduleCommit = useCallback(() => {
    if (useRaf) {
      runCallsRef.current += 1;
      fx.run(); // 同帧合并
    } else {
      // naive：每次都直接算 + setState（同一帧多点会放大成本）
      commitHitTest();
    }
  }, [commitHitTest, fx, useRaf]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    draggingRef.current = true;

    const start = getLocalPoint(e.clientX, e.clientY);
    if (!start) return;
    startLocalRef.current = start;

    buildCache();

    const sel = rectFrom(start, start);
    latestSelRef.current = sel;
    paintSelectionBox(sel);

    scheduleCommit();

    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const start = startLocalRef.current;
    if (!start) return;

    movesRef.current += 1;

    const samples = getSamples(e);
    pointsRef.current += samples.length;

    let lastSel: (Rect & { width: number; height: number }) | null = null;

    for (const p of samples) {
      const local = getLocalPoint(p.clientX, p.clientY);
      if (!local) continue;

      const sel = rectFrom(start, local);
      latestSelRef.current = sel;
      lastSel = sel;

      // 每个采样点都触发一次：raf 会同帧合并，naive 会每次都算+setState
      scheduleCommit();
    }

    // 框永远跟手：只画最后一个点
    if (lastSel) paintSelectionBox(lastSel);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    // 结束时强制提交最后一次，确保 selectedIds 与最终框一致
    if (useRaf) fx.flush();

    const box = boxRef.current;
    if (box) box.style.display = 'none';

    (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => buildCache());
    return () => cancelAnimationFrame(id);
  }, [buildCache, count, layout.cell, layout.cols, layout.gap]);

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${layout.cols}, ${layout.cell}px)`,
    gridAutoRows: `${layout.cell}px`,
    gap: layout.gap,
    justifyContent: 'center',
    alignContent: 'center',
    width: '100%',
    height: '100%',
  };

  const itemStyle: CSSProperties = {
    width: layout.cell,
    height: layout.cell,
    borderRadius: Math.max(2, Math.floor(layout.cell / 3)),
    background: '#f5f5f5',
  };

  const preview = selectedIds.slice(0, 12);

  return (
    <Card
      size="small"
      title="useRafThrottledEffect - selectedIds 进 React state"
      extra={
        <Switch
          checkedChildren="useRaf（同帧合并 takeLatest）"
          unCheckedChildren="naive raf（每点都算 + setState）"
          checked={useRaf}
          onChange={setUseRaf}
        />
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }} size={10}>
        <Flex gap={10} align="center" wrap="wrap">
          <Tag>moves/s: {movesPerSec}</Tag>
          <Tag>points/s: {pointsPerSec}</Tag>
          <Tag>run calls/s: {runsPerSec}</Tag>
          <Tag>hit-test commits/s: {commitsPerSec}</Tag>
          <Tag>avg commit cost: {avgCost.toFixed(2)}ms</Tag>
        </Flex>

        <Flex gap={10} align="center" wrap="wrap">
          <Typography.Text>元素数量：{count}</Typography.Text>
          <div style={{ flex: 1, minWidth: 240 }}>
            <Slider
              min={400}
              max={2200}
              step={100}
              value={count}
              onChange={(v) => setCount(v as number)}
            />
          </div>
        </Flex>

        <Flex gap={10} align="center" wrap="wrap">
          <Typography.Text>模拟 coalesced 点数（鼠标放大差异用）：{simulateK}</Typography.Text>
          <div style={{ flex: 1, minWidth: 240 }}>
            <Slider
              min={1}
              max={12}
              step={1}
              value={simulateK}
              onChange={(v) => setSimulateK(v as number)}
            />
          </div>
          <Button size="small" onClick={buildCache}>
            重建缓存
          </Button>
        </Flex>

        <Flex gap={8} align="center" wrap="wrap">
          <Tag>selectedIds.length: {selectedIds.length}</Tag>
          {preview.map((id) => (
            <Tag key={id} style={{ marginInlineEnd: 0 }}>
              {id}
            </Tag>
          ))}
          {selectedIds.length > preview.length ? (
            <Typography.Text type="secondary">…</Typography.Text>
          ) : null}
        </Flex>

        <div
          ref={areaRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: 'relative',
            height: 340,
            border: '1px solid #f0f0f0',
            borderRadius: 10,
            userSelect: 'none',
            touchAction: 'none',
            overflow: 'hidden',
            background: '#fff',
            padding: PAD,
          }}
        >
          <div
            ref={boxRef}
            style={{
              position: 'absolute',
              left: PAD,
              top: PAD,
              display: 'none',
              width: 0,
              height: 0,
              border: '1px solid rgba(22,119,255,0.9)',
              background: 'rgba(22,119,255,0.10)',
              borderRadius: 6,
              pointerEvents: 'none',
              willChange: 'transform,width,height',
            }}
          />

          <div style={gridStyle}>
            {Array.from({ length: count }).map((_, i) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                ref={(n) => {
                  itemElsRef.current[i] = n;
                }}
                style={itemStyle}
              />
            ))}
          </div>

          <div style={{ position: 'absolute', left: 12, top: 10 }}>
            <Typography.Text strong>按住拖动框选</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              真实重活：命中检测 + 生成 selectedIds 列表并 setState。
              <br />
              同一帧内多点（coalesced/模拟）时，naive 会重复做；raf 会合并到每帧一次。
            </Typography.Text>
          </div>
        </div>
      </Space>
    </Card>
  );
}
