/**
 * sheetPreview.ts — Excel(.xlsx / .xlsm) 转 HTML 表格，供工作台内联预览
 *
 * 为什么在服务端转：浏览器没有任何原生手段渲染 xlsx（它本质是一包 XML 的 zip），
 * 与 .docx 交给 mammoth 是同一个套路 —— 服务端出 HTML，前端只负责净化与渲染。
 *
 * 为什么选 exceljs 而不是 SheetJS(xlsx)：npm 上的 xlsx 停在 0.18.5，且带已知漏洞
 * （原型污染 CVE-2023-30533、ReDoS CVE-2024-22363），官方已迁出 npm。exceljs 是纯 JS、
 * 无原生编译；代价是不支持 2003 的二进制 .xls（BIFF），那类文件由路由层给出明确提示。
 *
 * 定位是"预览"不是"导出"：行/列/工作表都有上限，避免一个几十万行的表把浏览器拖死；
 * 截断情况通过 messages 回给前端展示，而不是静默丢数据。
 */
import * as ExcelJS from 'exceljs';

/** 最多预览的工作表数（超出只回前几个并告警） */
const MAX_SHEETS = 5;
/** 每个工作表最多预览的行数 */
const MAX_ROWS = 200;
/** 每个工作表最多预览的列数 */
const MAX_COLS = 40;

export interface SheetPreview {
  name: string;
  html: string;
  /** 实际渲染出的行/列数，便于前端显示规模 */
  rows: number;
  cols: number;
  truncated: boolean;
}

export interface SheetPreviewResult {
  sheets: SheetPreview[];
  messages: string[];
}

/** HTML 转义：单元格内容来自用户文件，必须当纯文本处理，不能当标记 */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "A1:C3" → 0-based 闭区间行列号；解析失败返回 null */
function parseRange(ref: string): { top: number; left: number; bottom: number; right: number } | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec((ref || '').trim());
  if (!m) return null;
  const col = (s: string) =>
    s.toUpperCase().split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  return { left: col(m[1]), top: Number(m[2]) - 1, right: col(m[3]), bottom: Number(m[4]) - 1 };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 日期按本地时间格式化；只有日期没有时间时不补 00:00:00，避免把"日期"显示成"时刻" */
function formatDate(d: Date): string {
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const hasTime = d.getHours() || d.getMinutes() || d.getSeconds();
  return hasTime ? `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` : date;
}

/** 单元格取值 → 纯文本（exceljs 的 value 是多态的：富文本/公式/超链接/日期…） */
function cellText(value: any): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value);
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value.richText)) {
    return value.richText.map((t: any) => t?.text ?? '').join('');
  }
  // 公式单元格：看表的人关心算出来的结果，公式文本只在工具提示里有意义
  if ('result' in value) return cellText(value.result);
  if ('error' in value) return String(value.error ?? '');
  if ('text' in value) return String(value.text ?? '');
  if ('hyperlink' in value) return String(value.hyperlink ?? '');
  return '';
}

/** argb（8 位 AARRGGBB，exceljs 恒带 alpha 通道）→ #RRGGBB；非字符串/透明度丢失类一律忽略 */
function argbToHex(argb: unknown): string {
  return typeof argb === 'string' && /^[0-9a-f]{8}$/i.test(argb) ? `#${argb.slice(2)}` : '';
}

/**
 * 单元格自身样式 → 内联 style。
 * 只搬"影响可读性"的几项（粗斜体、字号、字色、底色、对齐），边框/条件格式/数字格式交给下游：
 * 表格线由前端 CSS 统一画，才能跟随深浅色主题；用文件里的边框反而在暗色下更难看。
 */
function cellStyle(cell: any): string {
  const s: string[] = [];
  const f = cell?.font;
  if (f?.bold) s.push('font-weight:600');
  if (f?.italic) s.push('font-style:italic');
  if (f?.underline) s.push('text-decoration:underline');
  const fg = argbToHex(f?.color?.argb);
  if (fg && fg.toLowerCase() !== '#000000') s.push(`color:${fg}`);
  if (typeof f?.size === 'number' && f.size > 0 && Math.round(f.size) !== 11) {
    s.push(`font-size:${Math.round(f.size)}px`);
  }
  const bg = argbToHex(cell?.fill?.type === 'pattern' ? cell.fill.fgColor?.argb : '');
  if (bg && bg.toLowerCase() !== '#ffffff') s.push(`background:${bg}`);
  const align = cell?.alignment;
  if (align?.horizontal) s.push(`text-align:${align.horizontal}`);
  if (align?.vertical && align.vertical !== 'bottom') s.push(`vertical-align:${align.vertical}`);
  return s.join(';');
}

/**
 * 合并区域列表。
 * exceljs 把它放在 worksheet.model.merges（不同版本可能不暴露），取不到就当作无合并 ——
 * 宁可少画几个合并单元格，也不能因为内部结构变动让整个预览报错。
 */
function getMerges(ws: any): Array<{ top: number; left: number; bottom: number; right: number }> {
  const out: Array<{ top: number; left: number; bottom: number; right: number }> = [];
  try {
    const raw: any = ws?.model?.merges ?? ws?._merges;
    const push = (ref: unknown) => {
      if (typeof ref !== 'string') return;
      const r = parseRange(ref);
      if (r) out.push(r);
    };
    if (Array.isArray(raw)) raw.forEach((m: any) => push(typeof m === 'string' ? m : m?.range));
    else if (raw && typeof raw === 'object') Object.keys(raw).forEach(push);
  } catch {
    /* 结构变动：退化为无合并 */
  }
  return out;
}

/** 行数（实际有内容的行），取不到时回退到 0 */
function rowCountOf(ws: any): number {
  const n = Number(ws?.actualRowCount ?? ws?.rowCount ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 列数，取不到时回退到"各行里最靠右的有值单元格" */
function colCountOf(ws: any): number {
  const n = Number(ws?.actualColumnCount ?? ws?.columnCount ?? 0);
  if (Number.isFinite(n) && n > 0) return n;
  let max = 0;
  try {
    ws?.eachRow?.({ includeEmpty: false }, (row: any) => {
      row?.eachCell?.({ includeEmpty: false }, (cell: any) => {
        if (cell?.col) max = Math.max(max, cell.col);
      });
    });
  } catch {
    /* 忽略：退化为 1 列 */
  }
  return max;
}

function renderSheet(ws: any): SheetPreview {
  const totalRows = rowCountOf(ws);
  const totalCols = colCountOf(ws);
  const rows = Math.min(totalRows, MAX_ROWS);
  const cols = Math.min(Math.max(totalCols, 1), MAX_COLS);
  const truncated = totalRows > MAX_ROWS || totalCols > MAX_COLS;

  // 合并区域：左上角记跨度，其余位置标记为"被覆盖"而跳过（否则会出现重复/空白格）
  const spanAt = new Map<string, { rowSpan: number; colSpan: number }>();
  const covered = new Set<string>();
  for (const m of getMerges(ws)) {
    if (m.top >= MAX_ROWS || m.left >= MAX_COLS) continue;
    const bottom = Math.min(m.bottom, MAX_ROWS - 1);
    const right = Math.min(m.right, MAX_COLS - 1);
    spanAt.set(`${m.top},${m.left}`, { rowSpan: bottom - m.top + 1, colSpan: right - m.left + 1 });
    for (let r = m.top; r <= bottom; r++) {
      for (let c = m.left; c <= right; c++) {
        if (r !== m.top || c !== m.left) covered.add(`${r},${c}`);
      }
    }
  }

  // 列宽：xlsx 里是"字符数"，粗略换算成像素；全为 0 时干脆不输出 colgroup，交给浏览器自动布局
  const declaredCols: any[] = Array.isArray(ws?.columns) ? ws.columns : [];
  let colgroup = '';
  if (declaredCols.some((c) => c && typeof c.width === 'number' && c.width > 0)) {
    const parts: string[] = [];
    for (let c = 0; c < cols; c++) {
      const w = declaredCols[c]?.width;
      const px = typeof w === 'number' && w > 0 ? Math.min(Math.round(w * 7 + 6), 360) : 90;
      parts.push(`<col style="width:${px}px">`);
    }
    colgroup = `<colgroup>${parts.join('')}</colgroup>`;
  }

  const trs: string[] = [];
  for (let r = 1; r <= rows; r++) {
    const row: any = ws.getRow(r);
    const tds: string[] = [];
    for (let c = 1; c <= cols; c++) {
      if (covered.has(`${r - 1},${c - 1}`)) continue;
      const cell: any = row.getCell(c);
      const span = spanAt.get(`${r - 1},${c - 1}`);
      const attrs: string[] = [];
      if (span) {
        if (span.rowSpan > 1) attrs.push(`rowspan="${span.rowSpan}"`);
        if (span.colSpan > 1) attrs.push(`colspan="${span.colSpan}"`);
      }
      const style = cellStyle(cell);
      if (style) attrs.push(`style="${esc(style)}"`);
      tds.push(`<td${attrs.length ? ' ' + attrs.join(' ') : ''}>${esc(cellText(cell?.value))}</td>`);
    }
    trs.push(`<tr>${tds.join('')}</tr>`);
  }

  return {
    name: String(ws?.name ?? 'Sheet'),
    rows,
    cols,
    truncated,
    html: `<table class="sheet-table">${colgroup}<tbody>${trs.join('')}</tbody></table>`,
  };
}

/**
 * 解析工作簿并转成每个工作表一段 HTML。
 * 读取失败（文件损坏/其实是 xls 改了后缀/受密码保护）会抛出，由路由层转成 400/500 文案。
 */
export async function renderWorkbookHtml(filePath: string): Promise<SheetPreviewResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const all: any[] = workbook.worksheets || [];
  const messages: string[] = [];
  if (all.length === 0) {
    return { sheets: [], messages: ['该工作簿没有任何工作表'] };
  }
  if (all.length > MAX_SHEETS) {
    messages.push(`共 ${all.length} 个工作表，预览前 ${MAX_SHEETS} 个`);
  }

  const sheets = all.slice(0, MAX_SHEETS).map(renderSheet);
  for (const s of sheets) {
    if (s.truncated) {
      messages.push(`工作表「${s.name}」内容较大，仅预览前 ${s.rows} 行 × ${s.cols} 列`);
    }
  }
  return { sheets, messages };
}
