// 解析 node_modules 中的第三方模块
import resolve from '@rollup/plugin-node-resolve';

// 将 CommonJS 模块转换为 ES6 模块
import commonjs from '@rollup/plugin-commonjs';

// TypeScript 插件，支持编译 TS 代码
import typescript from '@rollup/plugin-typescript';

// Babel 插件，用于代码转译和 polyfill 处理
import babel from '@rollup/plugin-babel';

// 压缩代码（UMD 格式用）
import terser from '@rollup/plugin-terser';

// 外部依赖处理插件，自动排除 peerDependencies
import peerDepsExternal from 'rollup-plugin-peer-deps-external';

// TS 声明文件生成插件
import dts from 'rollup-plugin-dts';

// Node.js 的 fs/promises 模块中的 cp（copy）函数，用于文件复制
import { cp } from 'node:fs/promises';

// 导入package.json文件，使用ES模块的assert语法指定文件类型
// assert { type: 'json' } 是JSON模块导入的语法
import pkg from './package.json' assert { type: 'json' };

// 定义输出格式和对应目录的映射关系
// cjs: CommonJS 格式，输出到 lib 目录
// esm: ES Module 格式，输出到 es 目录
// umd: UMD 格式，输出到 dist 目录
const formats = {
  cjs: 'lib',
  esm: 'es',
  umd: 'dist',
};

// 通用插件数组
const commonPlugins = [
  // 自动排除package.json中的peerDependencies
  // 这行配置很重要，避免将peerDependencies打包进最终bundle
  peerDepsExternal(),
  resolve(),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    // 关键：不生成声明文件
    // 因为 @rollup/plugin-typescript 会为每个源文件生成对应的 .d.ts
    // 无法做到将所有类型合并到一个文件
    // 需要用 rollup-plugin-dts 生成单个声明文件，然后复制到对应目录
    declaration: false,
    declarationDir: null,
  }),
  babel({
    babelHelpers: 'bundled',
    extensions: ['.ts', '.tsx'],
    exclude: 'node_modules/**',
    presets: [
      '@babel/preset-env',
      '@babel/preset-typescript',
      ['@babel/preset-react', { runtime: 'automatic' }],
    ],
  }),
];

// 生成多个输出配置
const buildConfigs = Object.entries(formats).map(([format, dir]) => ({
  // 入口文件路径
  input: 'src/index.ts',

  // 输出配置
  output: {
    // 输出文件路径，根据格式确定文件扩展名
    // 如果是esm格式使用.js扩展名，CommonJS使用.cjs扩展名，UMD使用.umd.js扩展名
    file: `${dir}/index.${format === 'esm' ? 'js' : format === 'umd' ? 'umd.js' : 'cjs'}`,
    format,

    // 只有当格式是umd时才设置全局变量名
    // 使用package.json中的name字段，如果没有则使用默认值'hooks'
    // 这个只在浏览器环境（UMD格式）中需要
    name: format === 'umd' ? pkg.name || 'hooks' : undefined,

    globals:
      format === 'umd'
        ? {
            react: 'React',
            'react-dom': 'ReactDOM',
          }
        : undefined,

    // 生成sourcemap文件，便于调试
    sourcemap: true,
  },

  // 外部依赖配置
  // 只有非UMD格式才将react和react-dom标记为外部依赖
  // 这意味着这些依赖不会被打包，而是需要在运行时环境中提供
  // 这行配置很重要，可以减少包体积
  external: format !== 'umd' ? ['react', 'react-dom'] : [],

  // 插件配置数组
  plugins: [
    ...commonPlugins,

    // 只有UMD格式才使用压缩插件
    // 这行配置很重要，可以减少生产环境包体积
    format === 'umd' &&
      terser({
        compress: {
          drop_console: true, // 删除console语句
          drop_debugger: true, // 删除debugger语句
        },
      }),
  ].filter(Boolean),
}));

// 类型声明文件配置
const dtsConfig = {
  input: 'src/index.ts',
  output: {
    file: 'es/index.d.ts',
  },
  plugins: [
    // 生成TypeScript声明文件
    dts(),

    // 自定义插件，用于复制声明文件
    {
      name: 'copy-dts', // 插件名称

      // closeBundle钩子函数，在构建完成后执行
      async closeBundle() {
        // 复制声明文件到 lib 目录
        cp('es/index.d.ts', 'lib/index.d.ts', { force: true });

        // 输出日志信息
        console.log('TypeScript declaration files copied to lib/ directories.');
      },
    },
  ],
};

export default [...buildConfigs, dtsConfig];
