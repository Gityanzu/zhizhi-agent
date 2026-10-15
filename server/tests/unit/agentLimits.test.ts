/**
 * agentLimits.ts / agent 轮次上限 单元测试
 *
 * 覆盖的回归：
 *   1. 最大轮次默认值曾是 5 —— 实测「生成开发工程师简历（Word + PDF 各一份）」
 *      这类多步任务，探测依赖(1) → 装依赖(2) → 查字体(3) → 复核依赖(4) → 跑脚本(5)
 *      就把 5 轮用满，真正产出文件的那一步永远走不到。
 *   2. 轮次耗尽后的说明曾写成"处理超时，请简化问题"（根因不是超时），
 *      而且这句话在下游被两层丢弃、任务仍被标记成 completed，
 *      用户观感就是"任务没做完却结束了"。
 */
import { describe, it, expect, vi } from 'vitest';
import { buildIterationExhaustedNotice, buildStuckLoopNotice } from '../../src/services/agentLimits';
import { config } from '../../src/config';

describe('buildIterationExhaustedNotice 轮次耗尽说明', () => {
  it('说清是轮次用尽而非超时，并带上实际轮次', () => {
    const notice = buildIterationExhaustedNotice(25);
    expect(notice).toContain('25 轮');
    expect(notice).toContain('尚未完成');
    // 旧文案是「处理超时」，会把排查方向带偏
    expect(notice).not.toContain('超时');
  });

  it('说明已有进度未丢失，并给出可执行的下一步', () => {
    const notice = buildIterationExhaustedNotice(10);
    expect(notice).toContain('保留');
    expect(notice).toContain('继续');
    expect(notice).toContain('AGENT_MAX_ITERATIONS');
  });

  it('轮次为 1 也不会出现空描述', () => {
    expect(buildIterationExhaustedNotice(1)).toContain('1 轮');
  });
});

describe('buildStuckLoopNotice 卡死循环说明', () => {
  it('说清是"重复调用被主动停止"，而不是让对话凭空停住', () => {
    const notice = buildStuckLoopNotice('code_interpreter:{"code":"print(1)"}');
    expect(notice).toContain('重复');
    expect(notice).toContain('已主动停止');
    expect(notice).toContain('code_interpreter');
    // 要给出可执行的下一步
    expect(notice).toContain('继续');
  });

  it('超长签名会被截断，避免把整段代码塞进消息', () => {
    const notice = buildStuckLoopNotice(`code_interpreter:${'x'.repeat(1000)}`);
    expect(notice.length).toBeLessThan(600);
    expect(notice).toContain('…');
  });
});

describe('agent 轮次上限配置', () => {
  it('默认上限要够多步任务用，不能再退回 5', () => {
    expect(config.agent.maxIterations).toBeGreaterThanOrEqual(20);
  });

  it('可用 AGENT_MAX_ITERATIONS 覆盖（严格模式/成本控制场景）', async () => {
    vi.resetModules();
    const prev = process.env.AGENT_MAX_ITERATIONS;
    process.env.AGENT_MAX_ITERATIONS = '7';
    try {
      const reloaded = await import('../../src/config');
      expect(reloaded.config.agent.maxIterations).toBe(7);
    } finally {
      if (prev === undefined) delete process.env.AGENT_MAX_ITERATIONS;
      else process.env.AGENT_MAX_ITERATIONS = prev;
    }
  });

  it('非法值回退到默认，不会变成 NaN 把循环直接短路', async () => {
    vi.resetModules();
    const prev = process.env.AGENT_MAX_ITERATIONS;
    process.env.AGENT_MAX_ITERATIONS = 'not-a-number';
    try {
      const reloaded = await import('../../src/config');
      expect(reloaded.config.agent.maxIterations).toBe(config.agent.maxIterations);
      expect(Number.isNaN(reloaded.config.agent.maxIterations)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.AGENT_MAX_ITERATIONS;
      else process.env.AGENT_MAX_ITERATIONS = prev;
    }
  });
});
