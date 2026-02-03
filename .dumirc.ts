import { defineConfig } from 'dumi';

export default defineConfig({
  styles: ['/styles/index.css'],
  resolve: {
    // 设置文档源目录
    docDirs: ['docs', 'packages/hooks/src'],

    // 设置原子组件（Hooks）目录
    atomDirs: [{ type: 'hook', dir: 'packages/hooks/src' }],
    codeBlockMode: 'passive',
  },
  outputPath: 'docs-dist',
  themeConfig: {
    name: 'TX Hooks',
    logo: '/logo.svg',
    favicon: '/favicon.ico',
    nav: [
      { title: '指南', link: '/guide' },
      {
        title: 'Hooks',
        link: '/hooks/use-boolean',
      },
    ],
    footer: 'Copyright © 2025-present Tommy Xu',
  },
  alias: {
    '@': '/packages/hooks/src',
    'tx-hooks': '/packages/hooks/src/index.ts',
  },
});
