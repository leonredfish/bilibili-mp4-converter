// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const { allExtensions } = require('eslint-config-expo/flat/utils/extensions.js');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // eslint-config-expo 的 flat/default.js 会把 `import/resolver` 整体覆盖成
    // 「只有 node resolver」（冲掉了 utils/core.js 里的 `typescript: true`）。
    // 后果：仓库内的本地 TS 包（package.json 的 file:modules/*，其 main 指向
    // src/index.ts）解析不到，报 import/no-unresolved。
    // 这里把 typescript resolver 加回来 —— TS 包与 `@/*` 别名都能正确解析。
    settings: {
      'import/extensions': allExtensions,
      'import/resolver': {
        typescript: true,
        node: { extensions: allExtensions },
      },
    },
  },
  {
    // scripts/ 下是 Node 脚本（CommonJS），需要 Node 全局（__dirname / require /
    // process / module …）。expo 默认给的是浏览器 + RN 全局，会把它们判成 no-undef。
    files: ['scripts/**/*.js', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]);
