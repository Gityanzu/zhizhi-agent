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
      isActive: s.id === skillManager.getActiveSkill().id,
    })),
    activeSkill: skillManager.getActiveSkill().id,
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
router.post('/match', (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: '缺少 message 参数' });
  }

  const skill = skillManager.matchSkill(message);
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
