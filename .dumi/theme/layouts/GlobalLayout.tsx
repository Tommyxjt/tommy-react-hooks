import React, { useEffect } from 'react';
import { useLocation, useOutlet } from 'dumi';
import mermaid from 'mermaid';

let inited = false;

function ensureMermaidBlocks() {
  // 你的情况：Prism 直接输出 pre.prism-code.language-mermaid（没有 code 子节点）
  document.querySelectorAll<HTMLPreElement>('pre.prism-code.language-mermaid').forEach((pre) => {
    const el = pre;
    if (el.dataset.mermaidBound === '1') return;

    const diagram = (el.innerText || el.textContent || '').trim();
    if (!diagram) return;

    const holder = document.createElement('div');
    holder.className = 'mermaid';
    holder.textContent = diagram;

    el.insertAdjacentElement('afterend', holder);
    el.style.display = 'none';
    el.dataset.mermaidBound = '1';
  });

  // 兼容其他环境：传统 pre > code.language-mermaid
  document.querySelectorAll<HTMLElement>('pre > code.language-mermaid').forEach((code) => {
    const pre = code.parentElement as HTMLPreElement | null;
    if (!pre) return;
    if (pre.dataset.mermaidBound === '1') return;

    const diagram = (code.textContent || '').trim();
    if (!diagram) return;

    const holder = document.createElement('div');
    holder.className = 'mermaid';
    holder.textContent = diagram;

    pre.insertAdjacentElement('afterend', holder);
    pre.style.display = 'none';
    pre.dataset.mermaidBound = '1';
  });
}

async function renderMermaid() {
  ensureMermaidBlocks();

  // SPA 路由切换后允许重新渲染
  document.querySelectorAll<HTMLElement>('.mermaid[data-processed]').forEach((el) => {
    el.removeAttribute('data-processed');
  });

  await mermaid.run({ querySelector: '.mermaid' });
}

export default function GlobalLayout(_props: any) {
  const location = useLocation();
  const outlet = useOutlet();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!inited) {
      mermaid.initialize({ startOnLoad: false });
      inited = true;
    }

    // 等 MD/代码高亮渲染完成后再跑
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // eslint-disable-next-line no-console
        renderMermaid().catch((e) => console.error('[mermaid] render failed:', e));
        return undefined;
      });
    });
  }, [location.pathname]);

  return <>{outlet}</>;
}
