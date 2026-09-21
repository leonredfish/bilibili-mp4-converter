# Pi React Native Demo

一个展示 React Native / Expo 核心能力的示例应用，包含导航、列表、表单、网络请求、动画与状态管理等常见模式。

## 技术栈

| 类别 | 选择 |
|------|------|
| 框架 | Expo SDK 57（managed workflow） |
| 运行时 | React Native 0.86 · React 19.2 |
| 语言 | TypeScript（strict） |
| 路由 | expo-router（文件路由 + 原生 Tab） |
| 状态管理 | Zustand |
| 动画 | react-native-reanimated 4（React Compiler 兼容写法） |
| 图标 | expo-symbols（SF Symbol + Material Symbol） |

## 页面一览

- **首页**（`src/app/index.tsx`）：卡片列表 + 点击跳转，演示 `FlatList`、`Link` 路由。
- **表单**（`src/app/form.tsx`）：`TextInput`、`Switch`、自定义下拉选择器（`Modal`），提交后 `Alert` 汇总。
- **数据**（`src/app/data.tsx`）：`fetch` 拉取公共 API，含下拉刷新、加载与错误/重试状态。
- **动画**（`src/app/animation.tsx`）：`withSpring` 弹簧、`withTiming` 旋转、`withRepeat` 无限循环。
- **设置**（`src/app/settings.tsx`）：Zustand 全局状态，浅色/深色/跟随系统主题切换。

## 运行

```bash
# 安装依赖（首次）
npm install

# Web 端（浏览器预览）
npm run web

# 真机（安装 Expo Go 后扫码）
npm start

# 原生打包（需要 Android SDK / Xcode，后续按需）
npx expo prebuild      # 生成 android/ ios/ 原生工程
npx expo run:android   # 或 npx expo run:ios
```

> 本机为 Windows 且未安装 Android SDK，默认用 Web 或真机 Expo Go 验证；`prebuild` 会生成可提交的原生工程，供后续打包。

## 目录结构

```
src/
  app/             # expo-router 路由（每个文件 = 一个页面 / 一个 Tab）
  components/      # 可复用 UI（ThemedText/View、Tab 栏等）
  stores/          # Zustand store（theme-store.ts）
  hooks/           # 自定义 hooks（主题解析、配色方案）
  constants/       # 主题色、间距等设计常量
assets/            # 图标与图片资源
```

## 主题系统说明

主题由 Zustand store（`src/stores/theme-store.ts`）管理，`mode` 支持 `light` / `dark` / `system`，并通过 `persist` 中间件持久化到 AsyncStorage（刷新/重启后保留用户选择）：

- `useResolvedColorScheme()` 综合系统配色与手动模式，返回最终生效的 `'light' | 'dark'`。
- `useTheme()` 返回对应的配色对象，供 `ThemedText` / `ThemedView` 等组件使用。
- 根布局 `src/app/_layout.tsx` 据此为 `ThemeProvider` 选择 `DefaultTheme` / `DarkTheme`。

## 备注

- 项目级 `.npmrc` 覆盖了用户级 `~/.npmrc` 中的 `allow-scripts=pnpm`（该配置会导致 npm 项目安装报 `EALLOWSCRIPTS`）。如需在其它项目复现，请同样置空或删除该行。
- Reanimated 共享值写入统一使用 `.set()`（而非 `.value =`），以兼容 React Compiler 的静态分析。
- `expo-env.d.ts`、`.expo/`、`dist/` 均为自动生成物，已加入 `.gitignore`。
