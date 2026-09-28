#!/usr/bin/env node
'use strict';

/**
 * 中国大陆网络环境下的 Gradle / 构建补丁。
 *
 * 由 package.json 的 postinstall 自动执行，也可手动执行：npm run patch:gradle
 * 脚本幂等：已打过补丁的文件不会被重复修改。
 *
 * 解决三个会让构建卡死或失败的问题：
 *   1. Gradle 发行版（约 130MB）从 services.gradle.org 下载超时
 *      —— wrapper 默认 networkTimeout 只有 10s。
 *   2. 主工程，以及两个 included build（RN / expo 的 Gradle 插件）直连
 *      mavenCentral / google / gradlePluginPortal 过慢。
 *      注意它们是独立构建，读不到主工程的仓库配置，必须单独打补丁。
 *   3. RN 的 Gradle 插件要求 jvmToolchain(17)，找不到本机 JDK 17 时会通过
 *      foojay-resolver 去 api.foojay.io 自动下载——国内不可达，会静默卡住数分钟。
 *
 * 可用环境变量覆盖：
 *   GRADLE_DIST_MIRROR    Gradle 发行版镜像（默认 腾讯云）
 *   MAVEN_MIRRORS         Maven 镜像，逗号分隔（默认 阿里云 4 个）
 *   JAVA17_HOME           显式指定 JDK 17 路径（默认自动探测）
 *   SKIP_GRADLE_PATCH=1   整体跳过本脚本
 *   PATCH_ROOT            改变作用的项目根目录（仅用于测试）
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.PATCH_ROOT
  ? path.resolve(process.env.PATCH_ROOT)
  : path.resolve(__dirname, '..');

/** wrapper 下载超时下限（10 分钟） */
const MIN_TIMEOUT_MS = 600000;

const DIST_MIRROR = (
  process.env.GRADLE_DIST_MIRROR || 'https://mirrors.cloud.tencent.com/gradle'
).replace(/\/+$/, '');

const MAVEN_MIRRORS = (
  process.env.MAVEN_MIRRORS ||
  [
    'https://maven.aliyun.com/repository/google',
    'https://maven.aliyun.com/repository/central',
    'https://maven.aliyun.com/repository/gradle-plugin',
    'https://maven.aliyun.com/repository/public',
  ].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** 两个 included build（独立构建，各自带仓库配置） */
const INCLUDED_BUILD_DIRS = [
  'node_modules/@react-native/gradle-plugin',
  'node_modules/expo-modules-autolinking/android/expo-gradle-plugin',
];

const log = (...args) => console.log('[patch-gradle-mirrors]', ...args);

const readIfExists = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

const exists = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

/** 已包含任一镜像地址即视为已打过补丁 */
const hasMirror = (s) => MAVEN_MIRRORS.some((u) => s.includes(u));

const groovyMirrorLines = (indent = '    ') =>
  MAVEN_MIRRORS.map((u) => `${indent}maven { url '${u}' }`).join('\n');

const ktsMirrorLines = (indent = '    ') =>
  MAVEN_MIRRORS.map((u) => `${indent}maven { url = uri("${u}") }`).join('\n');

/**
 * 把镜像插到每个 repositories { } 块的最前面，原有仓库保留在后面兜底。
 *
 * 两个要点：
 * - 正则必须容忍块内的 `maven { url ... }`，所以不能只写 [^{}]（否则整个
 *   allprojects 块会匹配失败、静默不补）。
 * - 块级幂等：已经含镜像的块原样跳过，因此局部打过补丁的文件也能安全重跑。
 */
function prependMirrors(src, mirrorLines) {
  let changed = false;

  const text = src.replace(
    /\brepositories\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    (match, inner) => {
      if (hasMirror(inner)) return match;

      const braceIdx = match.indexOf('{');
      const head = match.slice(0, braceIdx + 1);
      const tail = match.slice(braceIdx + 1); // 含原有换行/缩进，以及收尾的 }
      changed = true;

      // 多行块：原样保留缩进
      if (/^\s*\n/.test(tail)) return `${head}\n${mirrorLines}${tail}`;

      // 单行块 `repositories { mavenCentral() }`：拆成多行
      const body = tail.replace(/\}\s*$/, '').trim();
      return `${head}\n${mirrorLines}${body ? `\n  ${body}\n` : '\n'}}`;
    },
  );

  return { text, changed };
}

/* ------------------------------------------------------------------ *
 * 1. android/gradle/wrapper/gradle-wrapper.properties
 * ------------------------------------------------------------------ */
function patchGradleWrapper() {
  const rel = 'android/gradle/wrapper/gradle-wrapper.properties';
  const file = path.join(ROOT, rel);
  const src = readIfExists(file);
  if (src === null) return false;

  let hostPath = null;
  try {
    const u = new URL(DIST_MIRROR);
    hostPath = u.host + u.pathname.replace(/\/+$/, '');
  } catch {
    log(`警告：GRADLE_DIST_MIRROR 不是合法 URL，跳过发行版地址替换：${DIST_MIRROR}`);
  }

  const lines = src.split(/\r?\n/);
  let changed = false;
  let sawTimeout = false;

  for (let i = 0; i < lines.length; i += 1) {
    const dist = lines[i].match(/^distributionUrl=(.+?)\s*$/);
    if (dist && hostPath) {
      const raw = dist[1];
      const plain = raw.replace(/\\/g, ''); // 去掉 .properties 里的 '\:' 转义
      const name = plain.split('/').pop();
      const already = plain.startsWith(`https://${hostPath}/`) || plain.startsWith(`http://${hostPath}/`);
      if (name && !already) {
        // 保留原文件的 scheme 转义风格（Gradle 自带的是 https\://）
        const scheme = raw.includes('\\:') ? 'https\\:' : 'https:';
        lines[i] = `distributionUrl=${scheme}//${hostPath}/${name}`;
        changed = true;
      }
    }

    const timeout = lines[i].match(/^networkTimeout=(\d+)\s*$/);
    if (timeout) {
      sawTimeout = true;
      if (Number(timeout[1]) < MIN_TIMEOUT_MS) {
        lines[i] = `networkTimeout=${MIN_TIMEOUT_MS}`;
        changed = true;
      }
    }
  }

  if (!sawTimeout) {
    lines.push(`networkTimeout=${MIN_TIMEOUT_MS}`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    log('patched', rel);
  }
  return changed;
}

/* ------------------------------------------------------------------ *
 * 2. android/build.gradle（主工程）
 * ------------------------------------------------------------------ */
function patchAndroidBuildGradle() {
  const rel = 'android/build.gradle';
  const file = path.join(ROOT, rel);
  const src = readIfExists(file);
  if (src === null) return false;

  const { text, changed } = prependMirrors(src, groovyMirrorLines('    '));
  if (changed) {
    fs.writeFileSync(file, text, 'utf8');
    log('patched', rel);
  }
  return changed;
}

/* ------------------------------------------------------------------ *
 * 3. android/gradle.properties（本机 JDK 17）
 * ------------------------------------------------------------------ */
function jdkReleaseVersion(home) {
  const release = readIfExists(path.join(home, 'release'));
  if (!release) return null;
  const m = release.match(/JAVA_VERSION="(\d+)/);
  return m ? m[1] : null;
}

/** 探测本机 JDK 17：环境变量优先，其次常见安装位置（读 release 文件校验，不启进程） */
function findJdk17() {
  const seen = new Set();
  const candidates = [];
  const push = (p) => {
    if (!p) return;
    const norm = path.resolve(p);
    if (!seen.has(norm)) {
      seen.add(norm);
      candidates.push(norm);
    }
  };

  push(process.env.JAVA17_HOME);
  push(process.env.JAVA_HOME);

  const roots = [];
  if (process.platform === 'win32') {
    roots.push(
      'C:/Program Files/Java',
      'C:/Program Files/Eclipse Adoptium',
      'C:/Program Files/Microsoft',
      'C:/Program Files/Zulu',
      'D:/Programs/SDK_Tools',
      'D:/Programs',
    );
    push('C:/Program Files/Android/Android Studio/jbr');
  } else if (process.platform === 'darwin') {
    roots.push('/Library/Java/JavaVirtualMachines');
    push('/Applications/Android Studio.app/Contents/jbr/Contents/Home');
  } else {
    roots.push('/usr/lib/jvm', '/usr/java', '/opt/java', '/opt');
    push('/opt/android-studio/jbr');
  }

  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!/(jdk|java)[-_]?17|17\.\d/.test(name)) continue;
      push(path.join(root, name));
      push(path.join(root, name, 'Contents', 'Home')); // macOS bundle
    }
  }

  return candidates.find((home) => jdkReleaseVersion(home) === '17') || null;
}

function patchGradleProperties() {
  const rel = 'android/gradle.properties';
  const file = path.join(ROOT, rel);
  const src = readIfExists(file);
  if (src === null) return false;

  const jdk17 = findJdk17();
  if (!jdk17) {
    log('未找到 JDK 17，跳过 toolchain 配置（RN 的 Gradle 插件要求 jvmToolchain(17)）');
    log('若已安装，请设置 JAVA17_HOME=<JDK17 目录> 后重跑：npm run patch:gradle');
    return false;
  }

  const jdkPath = jdk17.replace(/\\/g, '/');
  const additions = [];
  if (!/^org\.gradle\.java\.home=/m.test(src)) additions.push(`org.gradle.java.home=${jdkPath}`);
  if (!/^org\.gradle\.java\.installations\.paths=/m.test(src)) {
    additions.push(`org.gradle.java.installations.paths=${jdkPath}`);
  }
  if (!/^org\.gradle\.java\.installations\.auto-download=/m.test(src)) {
    additions.push('org.gradle.java.installations.auto-download=false');
  }
  if (additions.length === 0) return false;

  const text =
    `${src.replace(/\s*$/, '')}\n\n` +
    '# patch-gradle-mirrors：使用本机 JDK 17，避免 Gradle 从 foojay.io 自动下载工具链（国内不可达）\n' +
    `${additions.join('\n')}\n`;

  fs.writeFileSync(file, text, 'utf8');
  log(`patched ${rel} → JDK 17: ${jdkPath}`);
  return true;
}

/* ------------------------------------------------------------------ *
 * 4. included build：node_modules 下 RN / expo 的 Gradle 插件
 * ------------------------------------------------------------------ */
function collectGradleFiles(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectGradleFiles(full, acc);
    else if (/\.gradle(\.kts)?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function patchIncludedBuilds() {
  let count = 0;
  for (const rel of INCLUDED_BUILD_DIRS) {
    const dir = path.join(ROOT, rel);
    if (!exists(dir)) continue;

    for (const file of collectGradleFiles(dir)) {
      const src = readIfExists(file);
      if (src === null || !src.includes('repositories')) continue;

      const lines = file.endsWith('.kts') ? ktsMirrorLines('    ') : groovyMirrorLines('    ');
      const { text, changed } = prependMirrors(src, lines);
      if (changed) {
        fs.writeFileSync(file, text, 'utf8');
        count += 1;
      }
    }
  }
  if (count > 0) log(`patched ${count} file(s) in node_modules（RN / expo 的 Gradle 插件）`);
  return count;
}

/* ------------------------------------------------------------------ */

function main() {
  // 注意：不能用 .some()——会短路，后面几步就不执行了
  const wrapper = patchGradleWrapper();
  const buildGradle = patchAndroidBuildGradle();
  const gradleProps = patchGradleProperties();
  const modules = patchIncludedBuilds();

  if (!wrapper && !buildGradle && !gradleProps && modules === 0) {
    log('无需改动（已打过补丁，或 android/ 尚未生成）');
  }
}

if (process.env.SKIP_GRADLE_PATCH === '1') {
  log('SKIP_GRADLE_PATCH=1，跳过');
} else {
  try {
    main();
  } catch (err) {
    // 这是便利性脚本，不应让 npm install 失败
    console.warn('[patch-gradle-mirrors] 执行出错（已忽略，不影响安装）:', err && err.message);
  }
}
