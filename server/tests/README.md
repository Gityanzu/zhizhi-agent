# 后端测试脚本

本目录存放后端开发过程中的测试脚本，用于验证各项功能。

## 测试脚本列表

### 大模型相关测试

| 脚本 | 用途 | 运行命令 |
|------|------|---------|
| `test_llm.js` | 大模型基础调用测试（LangChain ChatOpenAI） | `npm run test:llm` |
| `test_max.js` | 大模型最大Token/长文本测试 | `node tests/test_max.js` |
| `test_token.js` | Token用量统计测试 | `npm run test:token` |
| `test_thinking.js` | 思考模式/推理过程测试 | `npm run test:thinking` |

### 多模态相关测试

| 脚本 | 用途 | 运行命令 |
|------|------|---------|
| `test_vl.js` | 视觉理解/图片理解测试（版本1） | `npm run test:vl` |
| `test_vl2.js` | 视觉理解/图片理解测试（版本2） | `node tests/test_vl2.js` |
| `test_vl3.js` | 视觉理解/图片理解测试（版本3） | `node tests/test_vl3.js` |

### 网络相关测试

| 脚本 | 用途 | 运行命令 |
|------|------|---------|
| `test_net.js` | 网络连通性测试（百度、DuckDuckGo等） | `npm run test:net` |
| `test_baidu.js` | 百度搜索测试（版本1） | `npm run test:baidu` |
| `test_baidu2.js` | 百度搜索测试（版本2） | `node tests/test_baidu2.js` |
| `test_baidu3.js` | 百度搜索测试（版本3） | `node tests/test_baidu3.js` |

## 使用说明

### 前置条件
1. 已安装依赖：`npm install`
2. 已配置 `.env` 文件（包含 `LLM_API_KEY` 等）

### 运行单个测试
```bash
# 方式1：使用npm脚本
npm run test:llm

# 方式2：直接运行
node tests/test_llm.js
```

### 注意事项
- 测试脚本使用 CommonJS 格式（`require`），与主项目的 TypeScript ESM 格式不同
- 部分测试需要网络连接
- 多模态测试需要准备测试图片
- 测试脚本仅用于开发验证，不参与生产构建

## 目录结构

```
tests/
├── test_baidu.js      # 百度搜索测试
├── test_baidu2.js     # 百度搜索测试v2
├── test_baidu3.js     # 百度搜索测试v3
├── test_llm.js        # 大模型基础测试
├── test_max.js        # 最大Token测试
├── test_net.js        # 网络连通性测试
├── test_thinking.js   # 思考模式测试
├── test_token.js      # Token统计测试
├── test_vl.js         # 视觉理解测试v1
├── test_vl2.js        # 视觉理解测试v2
├── test_vl3.js        # 视觉理解测试v3
└── README.md          # 本说明文档
```
