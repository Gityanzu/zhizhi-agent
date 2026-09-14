require('dotenv').config();
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

async function test() {
  const llm = new ChatOpenAI({
    openAIApiKey: process.env.LLM_API_KEY,
    configuration: {
      baseURL: process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
    modelName: process.env.LLM_MODEL_NAME || 'qwen-turbo',
    temperature: 0.1,
    maxTokens: 2048,
  });

  console.log('模型:', process.env.LLM_MODEL_NAME);
  console.log('API:', process.env.LLM_BASE_URL);
  console.log('开始调用...\n');

  try {
    const messages = [
      new SystemMessage('你是一个 helpful 的助手。'),
      new HumanMessage('你好，请简单介绍一下你自己'),
    ];

    const result = await llm.invoke(messages);
    console.log('=== 返回结果 ===');
    console.log('类型:', typeof result);
    console.log('content:', result.content);
    console.log('text:', result.text);
    console.log('additional_kwargs:', JSON.stringify(result.additional_kwargs, null, 2));
    console.log('response_metadata:', JSON.stringify(result.response_metadata, null, 2));
  } catch (error) {
    console.error('调用失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

test();
