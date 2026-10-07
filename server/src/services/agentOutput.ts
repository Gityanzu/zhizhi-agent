/**
 * agentOutput.ts — Agent 文件工具输出根目录的运行时解析
 *
 * 解析优先级：
 *   1. 运行时覆盖（用户在桌面端设置里选定的目录，经 preferences 接口即时写入，无需重启）
 *   2. config.agent.outputDir（启动时由 ZHI_AGENT_OUTPUT_DIR / ZHI_USER_DATA/outputs / 仓库内 agent_output 决定）
 * 这样既支持 Electron 托管后端把产物落到用户本机目录，也让 Web 端维持仓库内沙箱默认值。
 */
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

let runtimeOverride: string | null = null;

/** 设置/清除运行时输出目录覆盖（dir 为空表示回退到 config 默认） */
export function setAgentOutputDir(dir?: string | null): void {
  const resolved = dir && dir.trim() ? path.resolve(dir.trim()) : null;
  if (resolved && !fs.existsSync(resolved)) {
    try {
      fs.mkdirSync(resolved, { recursive: true });
    } catch (e) {
      console.warn('[agentOutput] 创建覆盖目录失败:', e);
    }
  }
  runtimeOverride = resolved;
}

/** 当前生效的 Agent 输出根目录 */
export function getAgentOutputDir(): string {
  return runtimeOverride || config.agent.outputDir;
}

/** 当前是否显式设置了运行时覆盖 */
export function hasAgentOutputOverride(): boolean {
  return runtimeOverride !== null;
}
