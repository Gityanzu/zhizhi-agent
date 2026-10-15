/**
 * sheetPreview.ts 单元测试（Excel 转 HTML 表格）
 * 覆盖：文本转义、富文本/公式/日期取值、合并单元格跨度、超限截断告警、多工作表
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { renderWorkbookHtml } from '../../src/services/sheetPreview';

let dir = '';
let file = '';

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-preview-'));
  file = path.join(dir, 'test.xlsx');

  const wb = new ExcelJS.Workbook();
  const s1 = wb.addWorksheet('明细');
  s1.mergeCells('A1:D1');
  s1.getCell('A1').value = '<b>标题</b> & "引号"';
  s1.getCell('A1').font = { bold: true };
  s1.addRow(['名称', '数量', { richText: [{ text: '富' }, { text: '文本' }] }]);
  s1.addRow([new Date(2026, 9, 15), 2, { formula: 'B3*2', result: 4 }]);
  s1.addRow([{ error: '#DIV/0!' }, null, undefined]);

  const s2 = wb.addWorksheet('超长');
  for (let i = 0; i < 260; i++) s2.addRow([`r${i}`, i]);

  await wb.xlsx.writeFile(file);
});

afterAll(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 清理失败不影响断言 */
  }
});

describe('renderWorkbookHtml', () => {
  it('每个工作表转成一段表格 HTML，并保留工作表名', async () => {
    const { sheets } = await renderWorkbookHtml(file);
    expect(sheets.map((s) => s.name)).toEqual(['明细', '超长']);
    expect(sheets[0].html).toContain('<table class="sheet-table">');
  });

  it('单元格文本必须转义：Excel 里写 HTML 不能变成标记', async () => {
    const { sheets } = await renderWorkbookHtml(file);
    expect(sheets[0].html).toContain('&lt;b&gt;标题&lt;/b&gt; &amp; &quot;引号&quot;');
    expect(sheets[0].html).not.toContain('<b>标题</b>');
  });

  it('合并区域转成 colspan，被覆盖的单元格不再重复输出', async () => {
    const { sheets } = await renderWorkbookHtml(file);
    const firstRow = sheets[0].html.slice(0, sheets[0].html.indexOf('</tr>'));
    expect(firstRow).toContain('colspan="4"');
    // 合并行只应有一个 td
    expect(firstRow.match(/<td/g)?.length).toBe(1);
  });

  it('富文本拼接、公式取结果、日期本地化、错误值原样展示', async () => {
    const { sheets } = await renderWorkbookHtml(file);
    const html = sheets[0].html;
    expect(html).toContain('富文本');
    expect(html).toContain('>4<'); // 公式 result，而不是 "B3*2"
    expect(html).not.toContain('B3*2');
    expect(html).toContain('2026-10-15');
    expect(html).toContain('#DIV/0!');
  });

  it('超过行上限时截断并给出提示，而不是静默丢数据', async () => {
    const { sheets, messages } = await renderWorkbookHtml(file);
    const long = sheets.find((s) => s.name === '超长')!;
    expect(long.rows).toBe(200);
    expect(long.truncated).toBe(true);
    expect(messages.join()).toContain('仅预览前 200 行');
  });

  it('文件无法解析时抛错，交由路由层转成可读文案', async () => {
    const bad = path.join(dir, 'bad.xlsx');
    fs.writeFileSync(bad, 'not a workbook');
    await expect(renderWorkbookHtml(bad)).rejects.toBeTruthy();
  });
});
