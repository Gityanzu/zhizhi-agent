import { Router } from 'express';
import { skillManager } from '../skills';

const router = Router();

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

export default router;
