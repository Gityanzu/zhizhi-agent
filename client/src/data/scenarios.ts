// 场景分类定义
export interface Scenario {
  id: string;
  name: string;
  icon: string;
  description: string;
  agents: string[]; // Agent ID 列表
}

// 场景到 Agent 的映射
export const SCENARIOS: Scenario[] = [
  {
    id: 'office',
    name: '日常办公',
    icon: '💼',
    description: '文档处理、会议纪要、翻译等办公场景',
    agents: ['writing-assistant', 'meeting-minutes', 'translator'],
  },
  {
    id: 'coding',
    name: '代码开发',
    icon: '💻',
    description: '代码审查、编程助手、技术方案等开发场景',
    agents: ['code-reviewer', 'programming-assistant', 'frontend-expert'],
  },
  {
    id: 'writing',
    name: '内容创作',
    icon: '✍️',
    description: '文章写作、创意文案、法律合同等内容创作',
    agents: ['creative-writing', 'legal-advisor', 'content-writer'],
  },
  {
    id: 'data',
    name: '数据分析',
    icon: '📊',
    description: '数据处理、统计分析、可视化图表等分析场景',
    agents: ['data-analyst', 'excel-helper', 'business-intelligence'],
  },
  {
    id: 'learning',
    name: '学习研究',
    icon: '📚',
    description: '学术研究、论文写作、知识问答等学习场景',
    agents: ['academic-researcher', 'study-tutor', 'knowledge-qa'],
  },
];

// 默认场景
export const DEFAULT_SCENARIO_ID = 'office';
