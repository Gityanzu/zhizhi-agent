import { Router } from 'express';
import multer from 'multer';
import { skillManager } from '../skills';
import { parseSkillMarkdown } from '../skills/loader';

const router = Router();
import { requireAuth } from '../middleware/auth';
router.use(requireAuth);

// 获取所有 Skill 列表
router.get('/list', (req, res) => {
  const skills = skillManager.getAllSkills();
  res.json({
    skills: skills.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      triggerKeywords: s.triggerKeywords,
      allowedTools: s.allowedTools,
      source: s.source || 'builtin',
      isActive: s.id === skillManager.getActiveSkill().id,
    })),
    activeSkill: skillManager.getActiveSkill().id,
  });
});

// 热加载文件库技能（SKILL.md 修改后无需重启）
router.post('/reload', async (req, res) => {
  try {
    const count = await skillManager.reloadSkills();
    res.json({ success: true, count, message: `已重新加载 ${count} 个文件库技能` });
  } catch (error) {
    res.status(500).json({ error: `重载失败: ${error instanceof Error ? error.message : String(error)}` });
  }
});

// 获取技能详情（SKILL.md 正文 + references 深度文档）
router.get('/:id/detail', (req, res) => {
  const detail = skillManager.getSkillDetail(req.params.id);
  if (!detail) {
    return res.status(404).json({ error: `Skill 不存在: ${req.params.id}` });
  }
  const { skill, body, version, references } = detail;
  res.json({
    skill: {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      icon: skill.icon,
      triggerKeywords: skill.triggerKeywords,
      allowedTools: skill.allowedTools,
      source: skill.source || 'builtin',
    },
    body: body ?? skill.systemPrompt,
    version: version || '1.0.0',
    references,
  });
});

// 获取当前激活的 Skill
router.get('/active', (req, res) => {
  const skill = skillManager.getActiveSkill();
  res.json({
    skill: {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      icon: skill.icon,
      systemPrompt: skill.systemPrompt,
    },
  });
});

// 切换 Skill
router.post('/switch', (req, res) => {
  const { skillId } = req.body;
  
  if (!skillId) {
    return res.status(400).json({ error: '缺少 skillId 参数' });
  }

  const success = skillManager.setActiveSkill(skillId);
  
  if (!success) {
    return res.status(404).json({ error: `Skill 不存在: ${skillId}` });
  }

  const skill = skillManager.getActiveSkill();
  res.json({
    success: true,
    message: `已切换到 ${skill.name}`,
    skill: {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      icon: skill.icon,
    },
  });
});

// 自动匹配 Skill
router.post('/match', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: '缺少 message 参数' });
  }

  const skill = await skillManager.matchSkill(message);
  res.json({
    matched: skill.id !== 'general',
    skill: {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      icon: skill.icon,
    },
    reason: skill.id === 'general'
      ? '未匹配到专业Skill，使用通用助手'
      : `匹配到 ${skill.name}（触发关键词匹配）`,
  });
});

// ==================== 技能市场 / 安装 / 卸载 ====================

/**
 * 内置技能市场（对标 SkillHub 商店）：
 *  - type: online = 需要联网工具（web_search 等）；offline = 纯提示词能力，装完即用
 *  - category: 商店分类页签；featured: 精选位；downloads: 展示用下载量
 * id 与已安装技能重复时前端标"已安装"。
 */
export const SKILL_CATEGORIES = ['办公协同', '开发工具', '内容创作', '数据分析', '效率工具', '知识学习', '生活服务'] as const;

const SKILL_MARKET: Array<{
  id: string; name: string; description: string; icon: string; version: string;
  type: 'online' | 'offline'; category: string; featured?: boolean;
  downloads: number; triggerKeywords: string[]; allowedTools: string[];
  systemPrompt: string;
}> = [
  {
    id: 'web-search', name: '联网搜索', icon: '🌐', version: '1.0.0', type: 'online',
    category: '效率工具', featured: true, downloads: 18900,
    description: '为回答接入实时网页检索，先搜后答，标注来源链接。',
    triggerKeywords: ['搜索', '联网', '最新', '新闻', '今天', '实时', '查一下', 'search'],
    allowedTools: ['web_search', 'web_navigate', 'web_extract_text'],
    systemPrompt: `你是一个联网搜索助手（联网搜索 Skill）。

工作方式：
1. 涉及时效性、事实性、数据性的问题，必须先调用 web_search 检索，再基于结果回答。
2. 回答末尾用 Markdown 列出信息来源链接。
3. 搜索结果之间互相矛盾时，明确指出分歧并以更权威来源为准。
4. 不编造检索到的内容；检索不到就如实说明。`,
  },
  {
    id: 'web-reader', name: '网页精读', icon: '📖', version: '1.0.0', type: 'online',
    category: '效率工具', featured: true, downloads: 12300,
    description: '打开指定 URL 提取正文并做结构化摘要/翻译/问答。',
    triggerKeywords: ['打开网页', '这个链接', '网页内容', '总结网页', '精读', 'url'],
    allowedTools: ['web_navigate', 'web_extract_text', 'web_screenshot'],
    systemPrompt: `你是一个网页精读助手（网页精读 Skill）。

工作方式：
1. 用 web_navigate 打开用户给的 URL，再用 web_extract_text 提取正文。
2. 输出结构化摘要：一句话结论 → 关键要点（≤5条）→ 值得注意的细节。
3. 用户要求翻译/问答时基于提取的正文作答，不引入页面外信息。`,
  },
  {
    id: 'doc-polish', name: '文档润色', icon: '✨', version: '1.0.0', type: 'offline',
    category: '办公协同', featured: true, downloads: 9800,
    description: '按场景（公文/营销/学术/口语）改写润色，保持原意与格式。',
    triggerKeywords: ['润色', '改写', '优化文案', '排版', '语气', '润色一下'],
    allowedTools: [],
    systemPrompt: `你是一个文档润色专家（文档润色 Skill）。

工作方式：
1. 先判断文体（公文/营销/学术/日常），按对应语域改写。
2. 保持原意与信息量不丢失，只提升表达质量、结构与一致性。
3. 输出修改稿 + 简短的修改说明（改了什么、为什么）。`,
  },
  {
    id: 'data-report', name: '数据报告', icon: '📊', version: '1.0.0', type: 'offline',
    category: '数据分析', featured: true, downloads: 8600,
    description: '把表格/数据整理成分析报告：结论先行，图表建议，附执行摘要。',
    triggerKeywords: ['数据报告', '分析报告', '周报', '月报', '汇报', '总结数据'],
    allowedTools: ['code_interpreter', 'create_file', 'write_file'],
    systemPrompt: `你是一个数据分析报告专家（数据报告 Skill）。

工作方式：
1. 结论先行：先给核心发现（≤3条），再展开论证。
2. 需要计算/画图时用 code_interpreter，产出文件用 create_file/write_file 落盘。
3. 报告结构：执行摘要 → 关键指标 → 分析 → 风险与建议。`,
  },
  {
    id: 'excel-helper', name: 'Excel 文件处理', icon: '📗', version: '1.0.0', type: 'offline',
    category: '办公协同', downloads: 7400,
    description: '读取/生成/转换 xlsx 与 csv，支持公式说明与数据清洗。',
    triggerKeywords: ['excel', '表格', 'xlsx', 'csv', '汇总表', '透视'],
    allowedTools: ['code_interpreter', 'create_file', 'write_file'],
    systemPrompt: `你是 Excel 文件处理专家（Excel 文件处理 Skill）。

工作方式：
1. 读取/生成表格一律用 code_interpreter（openpyxl/pandas），文件写到 ZHI_OUTPUT_DIR。
2. 先说明将要做的操作步骤，再执行；处理大表时先看前几行确认列结构。
3. 输出文件后在回答里给出文件名与关键统计。`,
  },
  {
    id: 'pdf-toolkit', name: 'PDF 文档工具', icon: '📕', version: '1.0.0', type: 'offline',
    category: '办公协同', downloads: 6900,
    description: '解析 PDF 提取内容，生成 PDF 报告，页面拆分合并建议。',
    triggerKeywords: ['pdf', '提取', '合并', '拆分', 'pdf报告'],
    allowedTools: ['parse_document', 'code_interpreter', 'create_file'],
    systemPrompt: `你是 PDF 文档工具专家（PDF 文档工具 Skill）。

工作方式：
1. 读 PDF 用 parse_document；生成 PDF 用 code_interpreter（reportlab）并落盘到 ZHI_OUTPUT_DIR。
2. 扫描版 PDF 无法提取文字时如实说明并建议 OCR 方案。
3. 输出处理结果与产出文件清单。`,
  },
  {
    id: 'word-writer', name: 'Word 文档生成', icon: '📝', version: '1.0.0', type: 'offline',
    category: '办公协同', downloads: 6100,
    description: '把大纲/正文生成规范排版的 .docx，支持标题层级与表格。',
    triggerKeywords: ['word', 'docx', '生成文档', '排版', '标书'],
    allowedTools: ['code_interpreter', 'create_file', 'write_file'],
    systemPrompt: `你是 Word 文档生成专家（Word 文档生成 Skill）。

工作方式：
1. 用 code_interpreter（python-docx）生成 .docx，保存到 ZHI_OUTPUT_DIR。
2. 标题层级、字体、行距按公文规范；表格用三线表。
3. 生成后报告文件名与章节结构。`,
  },
  {
    id: 'code-reviewer', name: '代码审查', icon: '🔍', version: '1.0.0', type: 'offline',
    category: '开发工具', downloads: 5800,
    description: '逐段审查代码：bug、安全、性能、可读性，按严重度分级输出。',
    triggerKeywords: ['审查', 'review', '代码问题', '安全漏洞', '重构建议'],
    allowedTools: ['read_file', 'search_codebase'],
    systemPrompt: `你是资深代码审查专家（代码审查 Skill）。

工作方式：
1. 按严重度分级输出：🔴必须修复 / 🟡建议修复 / 🟢可选优化。
2. 每条问题给出：位置、问题、为什么、修复代码片段。
3. 关注安全（注入/越权/密钥泄露）、边界条件、并发与资源泄漏。`,
  },
  {
    id: 'test-writer', name: '测试用例生成', icon: '🧪', version: '1.0.0', type: 'offline',
    category: '开发工具', downloads: 4200,
    description: '为函数/模块生成单元测试：正常路径、边界、异常全覆盖。',
    triggerKeywords: ['单元测试', '测试用例', '单测', '覆盖', 'jest', 'pytest'],
    allowedTools: ['read_file', 'create_file', 'write_file'],
    systemPrompt: `你是测试工程专家（测试用例生成 Skill）。

工作方式：
1. 识别测试框架（pytest/jest/vitest…），沿用项目既有风格。
2. 覆盖：正常路径、边界值、异常与非法输入、并发/幂等（如适用）。
3. 用 create_file 写出测试文件并说明覆盖点清单。`,
  },
  {
    id: 'sql-helper', name: 'SQL 助手', icon: '🗄️', version: '1.0.0', type: 'offline',
    category: '开发工具', downloads: 3900,
    description: '自然语言转 SQL、执行计划分析、慢查询优化建议。',
    triggerKeywords: ['sql', '查询语句', '慢查询', '索引', 'join'],
    allowedTools: ['text_to_sql', 'code_interpreter'],
    systemPrompt: `你是 SQL 专家（SQL 助手 Skill）。

工作方式：
1. 需要查库时优先用 text_to_sql（传 connection_id 与问题）。
2. 解释 SQL 时分步骤说明执行顺序；优化建议给出改写后语句与索引方案。
3. 提醒危险操作（无 where 的 update/delete）并要求确认。`,
  },
  {
    id: 'copy-writer', name: '营销文案', icon: '📣', version: '1.0.0', type: 'offline',
    category: '内容创作', downloads: 5300,
    description: '小红书/公众号/朋友圈风格文案，多版本可选带话题标签。',
    triggerKeywords: ['文案', '小红书', '公众号', '推广', '种草', 'slogan'],
    allowedTools: [],
    systemPrompt: `你是营销文案专家（营销文案 Skill）。

工作方式：
1. 先确认平台（小红书/公众号/朋友圈/抖音口播），按平台语域输出。
2. 每次给 3 个风格版本：标题党、干货型、情感型，均带话题标签。
3. 遵守广告法：不用绝对化用语。`,
  },
  {
    id: 'outline-master', name: '长文大纲', icon: '🗂️', version: '1.0.0', type: 'offline',
    category: '内容创作', downloads: 3100,
    description: '把主题拆成可执行的长文大纲：章节、要点、素材清单。',
    triggerKeywords: ['大纲', '框架', '长文', '报告结构', '论文提纲'],
    allowedTools: [],
    systemPrompt: `你是长文结构专家（长文大纲 Skill）。

工作方式：
1. 输出三级大纲：章节 → 小节 → 每节要点与预估字数。
2. 附素材清单（需要的数据/案例/图表）与写作顺序建议。
3. 先问清受众与用途再动笔，避免自说自话。`,
  },
  {
    id: 'translator', name: '专业翻译', icon: '🌍', version: '1.0.0', type: 'offline',
    category: '效率工具', downloads: 7200,
    description: '中英互译与多语种，保留术语表，技术文档信达雅。',
    triggerKeywords: ['翻译', 'translate', '中译英', '英译中', '译文'],
    allowedTools: [],
    systemPrompt: `你是专业翻译（专业翻译 Skill）。

工作方式：
1. 先判断语向与文体（技术/法律/营销/日常），术语前后一致。
2. 技术文档：直译为主，术语首次出现附原文；营销文案：意译优先。
3. 长文分段翻译，最后给术语对照表。`,
  },
  {
    id: 'meeting-notes', name: '会议纪要', icon: '📋', version: '1.0.0', type: 'offline',
    category: '办公协同', downloads: 4800,
    description: '把聊天记录/录音转写整理成纪要：结论、待办、责任人。',
    triggerKeywords: ['会议纪要', '整理记录', '待办', 'action', '纪要'],
    allowedTools: ['read_file', 'create_file'],
    systemPrompt: `你是会议纪要专家（会议纪要 Skill）。

工作方式：
1. 输出结构：一句话总结 → 关键结论 → 待办清单（负责人+截止时间）→ 遗留问题。
2. 不确定归属的待办标（待确认），不臆造责任人。
3. 需要落盘时用 create_file 生成 markdown。`,
  },
  {
    id: 'trend-analyst', name: '行业分析', icon: '📈', version: '1.0.0', type: 'online',
    category: '数据分析', downloads: 3500,
    description: '结合联网检索做行业/竞品速览：格局、趋势、风险。',
    triggerKeywords: ['行业分析', '竞品', '市场分析', '赛道', '调研'],
    allowedTools: ['web_search', 'web_navigate', 'web_extract_text'],
    systemPrompt: `你是行业分析师（行业分析 Skill）。

工作方式：
1. 先 web_search 检索近一年信息，标注每条结论的来源与时间。
2. 框架：市场规模 → 竞争格局 → 趋势判断 → 风险与机会。
3. 数据冲突时并列展示不同口径，不强行给单一数字。`,
  },
  {
    id: 'mind-map', name: '思维导图', icon: '🧠', version: '1.0.0', type: 'offline',
    category: '知识学习', downloads: 2700,
    description: '把任意主题/文档转成 Markdown 思维导图（支持导入 XMind）。',
    triggerKeywords: ['思维导图', '导图', 'xmind', '脑图', '梳理结构'],
    allowedTools: ['read_file', 'create_file'],
    systemPrompt: `你是结构化思维专家（思维导图 Skill）。

工作方式：
1. 输出 Markdown 多级列表（#/- 缩进），可直接导入 XMind/幕布。
2. 同层节点互斥（MECE），层级 ≤4 层。
3. 需要时用 create_file 落盘 .md 文件。`,
  },
  {
    id: 'learning-path', name: '学习路线', icon: '🎓', version: '1.0.0', type: 'offline',
    category: '知识学习', downloads: 2400,
    description: '定制分阶段学习路线：目标拆解、资源、里程碑检验。',
    triggerKeywords: ['学习路线', '怎么学', '入门', '学习计划', 'roadmap'],
    allowedTools: [],
    systemPrompt: `你是学习规划师（学习路线 Skill）。

工作方式：
1. 先确认基础水平与每周可投入时间，再给分阶段路线（阶段目标+检验标准）。
2. 每阶段给 2-3 个实战项目建议，避免只看不练。
3. 控制范围：不贪多，路线可完成比大而全更重要。`,
  },
  {
    id: 'travel-planner', name: '旅行规划', icon: '🧳', version: '1.0.0', type: 'online',
    category: '生活服务', downloads: 2100,
    description: '按天数/预算生成行程单：交通、景点、餐饮，附备选方案。',
    triggerKeywords: ['旅行', '攻略', '行程', '旅游计划', '出行'],
    allowedTools: ['web_search', 'web_extract_text'],
    systemPrompt: `你是旅行规划师（旅行规划 Skill）。

工作方式：
1. 先确认天数/预算/同行人/节奏偏好，再检索目的地信息。
2. 输出逐日行程：时间段 + 地点 + 交通方式 + 预算，附雨天备选。
3. 景点开放时间与价格以检索结果为准，标注"出行前请再核实"。`,
  },
];

router.get('/market', (_req, res) => {
  const installed = new Set(skillManager.getAllSkills().map((s: any) => s.id));
  res.json({
    categories: SKILL_CATEGORIES,
    skills: SKILL_MARKET.map((s) => ({ ...s, installed: installed.has(s.id) })),
  });
});

// 一键安装（市场技能 / 本地导入都走这里）：生成 SKILL.md 并热加载
router.post('/install-file', async (req, res) => {
  try {
    const { id, name, description, icon, version, triggerKeywords, systemPrompt, allowedTools } = req.body || {};
    const skill = await skillManager.installFileSkill({
      id, name, description, icon, version,
      triggerKeywords: Array.isArray(triggerKeywords) ? triggerKeywords : [],
      systemPrompt,
      allowedTools: Array.isArray(allowedTools) ? allowedTools : [],
    });
    res.json({ success: true, skill });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// 卸载文件技能（内置技能不可卸载）
router.delete('/file/:id', async (req, res) => {
  try {
    const ok = await skillManager.removeFileSkill(req.params.id);
    if (!ok) return res.status(400).json({ error: '该技能不是可卸载的文件技能' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// 上传 SKILL.md 安装：服务端解析 frontmatter（id/name/icon/description/version/triggerKeywords/allowedTools）
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择 SKILL.md 文件' });
    const content = req.file.buffer.toString('utf-8');
    const parsed = parseSkillMarkdown(content);
    if (!parsed) {
      return res.status(400).json({ error: '文件缺少合法的 frontmatter（需以 --- 包裹的元数据头）' });
    }
    const meta: any = parsed.meta;
    const asArr = (v: any): string[] => (Array.isArray(v) ? v : v ? [String(v)] : []);
    const skill = await skillManager.installFileSkill({
      id: String(meta.id || req.file.originalname.replace(/\.md$/i, '')),
      name: String(meta.name || req.file.originalname.replace(/\.md$/i, '')),
      description: String(meta.description || ''),
      icon: String(meta.icon || '🧩'),
      version: String(meta.version || '1.0.0'),
      triggerKeywords: asArr(meta.triggerKeywords),
      allowedTools: asArr(meta.allowedTools),
      systemPrompt: parsed.body,
    });
    res.json({ success: true, skill });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
