/**
 * 密码强度检查服务
 * 提供密码强度验证和评分
 */

export interface PasswordValidationResult {
  valid: boolean;
  strength: 'weak' | 'medium' | 'strong';
  errors: string[];
  suggestions: string[];
}

export interface PasswordStrengthScore {
  score: number; // 0-100
  level: 'very_weak' | 'weak' | 'fair' | 'good' | 'strong' | 'very_strong';
}

/**
 * 验证密码强度
 * @param password - 要验证的密码
 * @returns 验证结果
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];
  const suggestions: string[] = [];

  // 长度检查
  if (password.length < 8) {
    errors.push('密码长度至少8个字符');
    suggestions.push('使用8个或更多字符');
  }

  if (password.length < 12) {
    suggestions.push('考虑使用12个或更多字符以获得更强的安全性');
  }

  // 大小写组合
  if (!/[A-Z]/.test(password)) {
    errors.push('密码必须包含至少一个大写字母');
    suggestions.push('添加一个大写字母如 "A"');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('密码必须包含至少一个小写字母');
    suggestions.push('添加一个小写字母如 "a"');
  }

  // 数字检查
  if (!/[0-9]/.test(password)) {
    errors.push('密码必须包含至少一个数字');
    suggestions.push('添加一个数字如 "1"');
  }

  // 特殊字符检查
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('密码必须包含至少一个特殊字符');
    suggestions.push('添加特殊字符如 "!" 或 "@"');
  }

  // 避免常见密码模式
  const commonPatterns = [
    /password/i,
    /123456/i,
    /qwerty/i,
    /admin/i,
    /welcome/i,
    /login/i,
    /abc123/i
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      errors.push('密码过于简单，包含常见模式');
      suggestions.push('使用更复杂、独特的密码');
      break;
    }
  }

  // 检查连续字符（如 abc, 123, abc123）
  const consecutiveChars = /[a-z]{2,}|[0-9]{2,}|[A-Z]{2,}/;
  if (consecutiveChars.test(password)) {
    errors.push('避免使用连续字符');
    suggestions.push('打乱字符顺序以提高安全性');
  }

  // 检查键盘模式（如 qwe, 123, asd）
  const keyboardPatterns = [
    /qwe/, /asd/, /zxc/, /lkj/, /mnb/, /vbn/,
    /123/, /456/, /789/, /012/, /321/, /654/, /987/, /210/,
    /1qaz/, /2wsx/, /3edc/, /4rfv/, /5tgb/, /6yhn/, /7ujm/,
    /8ik/, /9ol/, /0p/
  ];

  for (const pattern of keyboardPatterns) {
    if (pattern.test(password)) {
      errors.push('避免使用键盘模式');
      suggestions.push('随机组合字符以提高安全性');
      break;
    }
  }

  // 计算强度评分
  const score = calculateStrengthScore(password);

  // 确定强度级别
  let strength: 'weak' | 'medium' | 'strong';
  if (score < 40) strength = 'weak';
  else if (score < 70) strength = 'medium';
  else strength = 'strong';

  return {
    valid: errors.length === 0,
    strength,
    errors,
    suggestions
  };
}

/**
 * 计算密码强度分数
 * @param password - 密码
 * @returns 强度分数 (0-100)
 */
export function calculateStrengthScore(password: string): number {
  let score = 0;

  // 长度加分
  if (password.length >= 8) score += 10;
  if (password.length >= 10) score += 5;
  if (password.length >= 12) score += 10;
  if (password.length >= 14) score += 10;
  if (password.length >= 16) score += 10;

  // 字符多样性加分
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 20;

  // 唯一字符数加分
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= 4) score += 10;
  if (uniqueChars >= 6) score += 10;
  if (uniqueChars >= 8) score += 10;

  // 字符位置多样性
  if (/[^a-zA-Z0-9]/.test(password)) {
    // 包含特殊字符，检查位置分布
    const specialChars = password.match(/[^a-zA-Z0-9]/g);
    if (specialChars && specialChars.length >= 2) {
      score += 5;
    }
  }

  // 排除极端分数
  return Math.min(Math.max(score, 0), 100);
}

/**
 * 获取密码强度级别描述
 * @param score - 强度分数
 * @returns 强度级别和描述
 */
export function getPasswordStrengthLevel(score: number): PasswordStrengthScore {
  let level: PasswordStrengthScore['level'];

  if (score < 30) {
    level = 'very_weak';
  } else if (score < 50) {
    level = 'weak';
  } else if (score < 60) {
    level = 'fair';
  } else if (score < 80) {
    level = 'good';
  } else if (score < 95) {
    level = 'strong';
  } else {
    level = 'very_strong';
  }

  return {
    score,
    level
  };
}

/**
 * 生成密码建议
 * @param password - 密码
 * @returns 密码建议
 */
export function generatePasswordSuggestions(password: string): string[] {
  const suggestions: string[] = [];

  // 长度建议
  if (password.length < 8) {
    suggestions.push('使用8个或更多字符');
  } else if (password.length < 12) {
    suggestions.push('考虑使用12个或更多字符');
  }

  // 字符类型建议
  if (!/[A-Z]/.test(password)) {
    suggestions.push('添加大写字母');
  }
  if (!/[a-z]/.test(password)) {
    suggestions.push('添加小写字母');
  }
  if (!/[0-9]/.test(password)) {
    suggestions.push('添加数字');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    suggestions.push('添加特殊字符');
  }

  // 排除常见模式
  const commonPatterns = [
    { pattern: /password/i, msg: '避免使用"password"等常见词' },
    { pattern: /123456/i, msg: '避免使用纯数字' },
    { pattern: /qwerty/i, msg: '避免使用键盘相邻字符' },
    { pattern: /admin/i, msg: '避免使用"admin"等常见用户名' }
  ];

  for (const { pattern, msg } of commonPatterns) {
    if (pattern.test(password)) {
      suggestions.push(msg);
      break;
    }
  }

  return suggestions;
}

/**
 * 检查密码是否足够安全
 * @param password - 密码
 * @param minScore - 最小分数
 * @returns 是否足够安全
 */
export function isPasswordSecure(password: string, minScore: number = 40): boolean {
  const result = validatePasswordStrength(password);
  const score = calculateStrengthScore(password);

  return score >= minScore;
}
