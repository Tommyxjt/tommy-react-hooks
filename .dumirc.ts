import { defineConfig } from 'dumi';
import path from 'path';
import webpackChain from 'webpack-chain';
import sidebar from './.dumi/config/sidebar';

// rehype-mermaid 是 ESM 包，
// 而 dumi/umi 在加载 .dumirc.ts 时走的是 CommonJS 的 require()，
// 需要用一个 CJS 包装器在 transformer 里 import() ESM 插件
function rehypeMermaidLazy(options: any) {
  return async (tree: any, file: any) => {
    const mod = await import('rehype-mermaid');
    const rehypeMermaid = (mod as any).default ?? mod;
    const transformer = rehypeMermaid(options);
    return transformer(tree, file);
  };
}

export default defineConfig({
  styles: ['/styles/index.css'],
  // webpack 配置
  chainWebpack(config: webpackChain) {
    config.module
      .rule('md') // 处理 markdown 文件
      .test(/\.md$/)
      .use('insert-toc-loader')
      .loader(path.resolve(__dirname, './loader/insert-toc-loader.cjs'))
      .end();
  },
  extraRehypePlugins: [[rehypeMermaidLazy, { strategy: 'inline-svg' }]],
  resolve: {
    // 设置文档源目录
    docDirs: ['docs'],

    // 设置原子组件（Hooks）目录
    atomDirs: [
      { type: 'hook', dir: 'packages/hooks/src' },

      // 专门让 dumi 识别 useDebounce/docs 下的一层 md
      { type: 'hook', dir: 'packages/hooks/src/useDebounce/docs' },

      // 专门让 dumi 识别 useRaf/docs 下的一层 md
      { type: 'hook', dir: 'packages/hooks/src/useRaf/docs' },
    ],
    codeBlockMode: 'passive',
  },
  outputPath: 'docs-dist',

  themeConfig: {
    name: 'TX Hooks',
    logo: '/logo.svg',
    favicon: '/favicon.ico',
    prefersColor: { default: 'light', switch: false },
    nav: [
      { title: '指南', link: '/guide' },
      {
        title: 'Hooks',
        link: '/hooks/use-latest-ref',
        activePath: '/hooks',
      },
    ],
    sidebar,
    footer: 'Copyright © 2025-present Tommy Xu',
  },
  alias: {
    '@tx-labs/react-hooks$': path.resolve(__dirname, 'packages/hooks/src/index.ts'),
  },
});
