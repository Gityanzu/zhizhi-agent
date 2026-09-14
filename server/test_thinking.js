
const { ChatOpenAI } = require("@langchain/openai");
require("dotenv").config();

const llm = new ChatOpenAI({
  openAIApiKey: process.env.LLM_API_KEY,
  configuration: { baseURL: process.env.LLM_BASE_URL },
  modelName: "qwen3.8-flash",
  temperature: 0.7,
});

async function test() {
  // 测试1：普通调用
  console.log("=== 普通调用 ===");
  const r1 = await llm.invoke("1+1等于几？简单回答");
  console.log("content:", r1.content);
  console.log("response_metadata:", JSON.stringify(r1.response_metadata, null, 2));
  console.log("additional_kwargs:", JSON.stringify(r1.additional_kwargs, null, 2));
  
  // 测试2：带思考参数（通过 modelKwargs）
  console.log("\n=== 带 enable_thinking 参数 ===");
  try {
    const r2 = await llm.invoke("一个水池，进水管3小时放满，出水管5小时放空，同时开多久放满？", {
      modelKwargs: { enable_thinking: true }
    });
    console.log("content:", r2.content);
    console.log("response_metadata:", JSON.stringify(r2.response_metadata, null, 2));
    console.log("additional_kwargs:", JSON.stringify(r2.additional_kwargs, null, 2));
  } catch(e) {
    console.log("错误:", e.message);
  }
}

test().catch(console.error);
