/**
 * 技能库端到端测试（纯 CJS，直接跑编译产物 dist/，绕开 ts-node/Node24 ESM 问题）
 * 运行：node tests/test-skill-library.cjs   （需先 npm run build）
 *
 * 覆盖：
 *  1. SKILL.md frontmatter 解析（行内数组/列表/引号/BOM）
 *  2. 技能库加载：8 个文件技能、source=file、工具白名单
 *  3. 热加载：改文件 → reloadSkills → 内容生效
 *  4. parse_document 工具：解析 Markdown 文档
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'skills-library');

let failed = 0;
function check(name, cond, extra) {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
}

async function main() {
  // ===== 1. loader 解析 =====
  const { parseSkillMarkdown, loadSkillsFromLibrary } = require(path.join(ROOT, 'dist/skills/loader.js'));

  const bomDoc = '\uFEFF---\nid: t1\nname: "引号测试"\ntrigger_keywords:\n  - 甲\n  - 乙\nallowed_tools: [read_file, write_file]\n---\n正文内容';
  const p = parseSkillMarkdown(bomDoc);
  check('frontmatter: BOM 容忍 + 引号剥离', p && p.meta.name === '引号测试');
  check('frontmatter: 列表写法数组', Array.isArray(p.meta.triggerKeywords) && p.meta.triggerKeywords.length === 2);
  check('frontmatter: 行内数组', JSON.stringify(p.meta.allowedTools) === '["read_file","write_file"]');
  check('frontmatter: 无 frontmatter 返回 null', parseSkillMarkdown('普通 markdown') === null);

  // ===== 2. 技能库加载 =====
  const loaded = loadSkillsFromLibrary(LIB);
  check('技能库: 至少 8 个文件技能', loaded.length >= 8, `实际 ${loaded.length}`);
  const ids = loaded.map(l => l.skill.id).sort();
  const expect = ['api-designer', 'code-review', 'debugger', 'doc-parser', 'git-master', 'rag-search', 'sql-analyst', 'test-writer'];
  check('技能库: 8 个内置工程技能齐全', expect.every(e => ids.includes(e)), ids.join(','));
  const doc = loaded.find(l => l.skill.id === 'doc-parser');
  check('技能库: doc-parser 含 parse_document 工具', doc.skill.allowedTools.includes('parse_document'));
  check('技能库: doc-parser 有 references', doc.references.length >= 1, doc.references.map(r => r.name).join(','));
  check('技能库: source 标记为 file', loaded.every(l => l.skill.source === 'file'));

  // ===== 3. 热加载（SkillManager.reloadSkills）=====
  const { skillManager } = require(path.join(ROOT, 'dist/skills/index.js'));
  const tmpDir = path.join(LIB, '__hotreload_test__');
  fs.mkdirSync(path.join(tmpDir, 'references'), { recursive: true });
  const mkMd = (desc) => `---\nid: hotreload-test\nname: 热加载测试\ndescription: ${desc}\nicon: 🧪\nallowed_tools: [calculate]\n---\n你是热加载测试助手。版本：${desc}`;
  fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), mkMd('V1'), 'utf-8');

  let count = await skillManager.reloadSkills();
  let s = skillManager.getAllSkills().find(x => x.id === 'hotreload-test');
  check('热加载: 新增文件技能被发现', !!s && s.description === 'V1', `count=${count}`);

  fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), mkMd('V2'), 'utf-8');
  await skillManager.reloadSkills();
  s = skillManager.getAllSkills().find(x => x.id === 'hotreload-test');
  check('热加载: 修改内容生效（无需重启）', s && s.description === 'V2');

  // 移除验证：不依赖删除目录（Windows AV 句柄会导致 rm 不稳定），改用损坏 SKILL.md 使解析失败被跳过
  fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '没有 frontmatter 的普通文件', 'utf-8');
  await skillManager.reloadSkills();
  s = skillManager.getAllSkills().find(x => x.id === 'hotreload-test');
  check('热加载: 技能源失效后被移除', !s);

  // 尽力清理测试目录（失败不影响断言）
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 留给下次 */ }

  // ===== 4. parse_document 工具 =====
  const { executeTool } = require(path.join(ROOT, 'dist/services/agent.js'));
  const { getAgentOutputDir } = require(path.join(ROOT, 'dist/services/agentOutput.js'));
  const outDir = getAgentOutputDir();
  fs.mkdirSync(outDir, { recursive: true });
  const sample = path.join(outDir, 'skill_test_doc.md');
  fs.writeFileSync(sample, '# 测试文档\n\n这是第一段。\n\n## 第二章\n\n秘密数字是 42。', 'utf-8');

  const parsed = await executeTool('parse_document', { filename: 'skill_test_doc.md' });
  check('parse_document: 解析 Markdown 成功', parsed.includes('秘密数字是 42'), parsed.split('\n')[0]);

  const denied = await executeTool('parse_document', { filename: '' });
  check('parse_document: 空参数优雅拒绝', typeof denied === 'string' && denied.includes('文件名'));

  fs.rmSync(sample, { force: true });

  console.log(failed === 0 ? '\n🎉 全部通过' : `\n💥 ${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => { console.error('测试脚本异常:', err); process.exit(1); });
