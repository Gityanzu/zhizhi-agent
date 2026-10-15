/**
 * toolPolicy.ts 单元测试（L1 工具沙箱网关）
 * 覆盖：工具分类、审批要求、无审批通道 fail-closed、未知工具默认策略
 */
import { describe, it, expect, vi } from 'vitest';
import {
  getToolPolicy,
  getApprovalRequiredTools,
  gateToolExecution,
} from '../../src/services/toolPolicy';

describe('getToolPolicy 工具分类', () => {
  it('执行类工具（run_shell/code_interpreter）需要审批', () => {
    expect(getToolPolicy('run_shell')).toEqual({ kind: 'exec', requiresApproval: true });
    expect(getToolPolicy('code_interpreter')).toEqual({ kind: 'exec', requiresApproval: true });
  });

  it('外联类工具需要审批（浏览器导航），但 web_search 放行', () => {
    expect(getToolPolicy('web_navigate')).toEqual({ kind: 'network', requiresApproval: true });
    expect(getToolPolicy('web_extract_text')).toEqual({ kind: 'network', requiresApproval: true });
    expect(getToolPolicy('web_search').requiresApproval).toBe(false);
  });

  it('外部数据库查询需要审批', () => {
    expect(getToolPolicy('text_to_sql')).toEqual({ kind: 'db', requiresApproval: true });
  });

  it('只读/计算/文件读写工具不在此层审批', () => {
    for (const name of ['search_knowledge_base', 'calculate', 'read_file', 'list_files', 'git', 'parse_document']) {
      expect(getToolPolicy(name).requiresApproval).toBe(false);
    }
  });

  it('未知工具（如自定义 HTTP 工具）默认按外联并要求审批', () => {
    expect(getToolPolicy('my_custom_http_tool')).toEqual({ kind: 'network', requiresApproval: true });
  });

  it('getApprovalRequiredTools 覆盖全部危险工具', () => {
    const list = getApprovalRequiredTools();
    expect(list).toEqual(expect.arrayContaining([
      'run_shell', 'code_interpreter', 'web_navigate', 'text_to_sql',
    ]));
    expect(list).not.toContain('calculate');
  });
});

describe('gateToolExecution 网关判定', () => {
  it('放行类工具：直接返回 null（不触发审批）', async () => {
    const requestApproval = vi.fn();
    expect(await gateToolExecution('read_file', { requestApproval })).toBeNull();
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('危险工具 + 无审批通道 → fail-closed 拒绝', async () => {
    const msg = await gateToolExecution('run_shell', undefined);
    expect(msg).toContain('已安全拒绝');
    expect(msg).toContain('run_shell');
  });

  it('危险工具 + 用户批准 → 放行', async () => {
    const requestApproval = vi.fn().mockResolvedValue(true);
    expect(await gateToolExecution('code_interpreter', { requestApproval })).toBeNull();
    expect(requestApproval).toHaveBeenCalledTimes(1);
    const arg = requestApproval.mock.calls[0][0];
    expect(arg.kind).toBe('exec');
    expect(arg.path).toBe('tool:code_interpreter');
  });

  it('危险工具 + 未获批准 → 返回原因，且不能武断归因为"用户拒绝"', async () => {
    // 审批返回 false 有两种可能：用户点了拒绝，或等待超时被自动拒绝。
    // 二者无法从布尔值区分，所以文案不能写成"用户已拒绝" ——
    // 否则模型会误判用户意图，直接放弃本可重试的路径。
    const requestApproval = vi.fn().mockResolvedValue(false);
    const msg = await gateToolExecution('text_to_sql', { requestApproval });
    expect(msg).toContain('未获批准');
    expect(msg).toContain('text_to_sql');
    expect(msg).not.toContain('用户已拒绝');
  });
});
