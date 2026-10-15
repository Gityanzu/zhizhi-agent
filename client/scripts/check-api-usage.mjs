#!/usr/bin/env node
/**
 * 约定校验：组件/页面里不得直接发 HTTP 请求，也不得写死后端地址。
 *
 * 所有接口必须封装在 src/api 下 —— 那里统一处理 baseURL、token 注入、401 跳转。
 * 组件里直接 axios.get / fetch 会绕过这些公共逻辑（曾出现：UserSettings.vue 与
 * Sidebar.vue 直接 axios + 拼接 API_BASE，导致 token 不生效、地址写死）。
 *
 * 例外：src/api 目录内部允许使用 fetch —— SSE 流式响应（订阅任务事件、模型对比）
 * 无法通过 axios 读取响应流，属于合理用法。
 *
 * 用法：npm run lint:api
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const API_DIR = join(SRC, 'api');

const RULES = [
  { re: /from\s+['"]axios['"]/, msg: 'import axios：应改用 src/api 下的封装' },
  { re: /\baxios\.(get|post|put|delete|patch)\s*\(/, msg: '直接调用 axios：应改用 src/api 下的封装' },
  { re: /\bfetch\s*\(/, msg: '直接调用 fetch：应改用 src/api 下的封装（SSE 请放进 src/api）' },
  { re: /https?:\/\/localhost:\d+/, msg: '写死后端地址：应使用相对路径，由 api 实例与代理处理' },
  { re: /VITE_API_BASE_URL/, msg: '在组件里读取后端地址环境变量：应统一在 src/api/request.ts 中处理' },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(vue|ts|tsx|js|jsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const violations = [];
for (const file of walk(SRC)) {
  if (file.startsWith(API_DIR)) continue; // api 层是唯一允许直接发请求的地方
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        violations.push({
          file: relative(ROOT, file).replace(/\\/g, '/'),
          line: i + 1,
          msg: rule.msg,
          code: line.trim(),
        });
      }
    }
  });
}

if (violations.length === 0) {
  console.log('✅ 接口调用规范检查通过：未发现组件内直连 HTTP 的写法');
  process.exit(0);
}

console.error(`❌ 发现 ${violations.length} 处越权调用（接口须封装在 src/api 下）：\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`      ${v.msg}`);
  console.error(`      ${v.code}\n`);
}
process.exit(1);
