/**
 * rag-eval.ts — RAG 检索质量评估脚本（golden set / hit@k）
 *
 * 用法：
 *   1. 准备评估集 eval-set.json（格式见下方默认示例，也可 --file 指定自己的）：
 *      [{ "question": "向量库怎么配置？", "expectDocName": "部署文档.md" }, ...]
 *   2. 运行：cd server && npx tsx scripts/rag-eval.ts [--file eval-set.json] [--topK 5]
 *
 * 指标：hit@K = 期望文档出现在前 K 条检索结果中的比例。
 * 改造检索链路（分块/检索/rerank）前后各跑一次，对比即可防回归。
 */
import fs from 'fs';
import path from 'path';
import { hybridSearch } from '../services/vectorStore';
import { config } from '../config';

interface EvalCase {
  question: string;
  /** 期望命中的文档名（metadata.source） */
  expectDocName: string;
  /** 可选：期望命中的关键词（文档名匹配不到时用内容兜底判断） */
  expectKeyword?: string;
}

const args = process.argv.slice(2);
const fileArg = args.indexOf('--file');
const topKArg = args.indexOf('--topK');
const topK = topKArg >= 0 ? parseInt(args[topKArg + 1], 10) : config.rag.topK;
const evalFile = fileArg >= 0
  ? path.resolve(args[fileArg + 1])
  : path.resolve(__dirname, '../data/rag-eval-set.json');

// 默认评估集：仓库里没有时给出模板，方便照着写
const DEFAULT_SET: EvalCase[] = [
  { question: '向量数据库怎么配置？', expectDocName: '部署文档', expectKeyword: '向量' },
  { question: '怎么部署到生产环境？', expectDocName: '部署文档', expectKeyword: '部署' },
];

async function main() {
  let cases: EvalCase[] = DEFAULT_SET;
  if (fs.existsSync(evalFile)) {
    cases = JSON.parse(fs.readFileSync(evalFile, 'utf-8'));
    console.log(`已加载评估集: ${evalFile}（${cases.length} 条）`);
  } else {
    console.log(`⚠ 未找到评估集 ${evalFile}，使用内置示例。请按以下格式编写后用 --file 指定：`);
    console.log(`  ${JSON.stringify(DEFAULT_SET[0])}`);
  }

  let hits = 0;
  const details: string[] = [];

  for (const c of cases) {
    const results = await hybridSearch(c.question, topK);
    const matched = results.findIndex((r) => {
      if (c.expectDocName && r.source.includes(c.expectDocName)) return true;
      if (c.expectKeyword && r.content.includes(c.expectKeyword)) return true;
      return false;
    });

    if (matched >= 0 && matched < topK) {
      hits++;
      details.push(`✅ [hit@${matched + 1}] ${c.question}`);
    } else {
      const got = results.slice(0, 3).map((r) => r.source).join(', ') || '(空)';
      details.push(`❌ [miss] ${c.question} —— 期望「${c.expectDocName}」，实际前三: ${got}`);
    }
  }

  console.log('\n========== 评估结果 ==========');
  details.forEach((d) => console.log(d));
  const rate = cases.length ? ((hits / cases.length) * 100).toFixed(1) : '0';
  console.log(`\nhit@${topK} = ${hits}/${cases.length} (${rate}%)`);
  process.exit(rate === '100' ? 0 : 0); // 评估脚本不因未命中而失败退出
}

main().catch((e) => {
  console.error('评估执行失败:', e);
  process.exit(1);
});
