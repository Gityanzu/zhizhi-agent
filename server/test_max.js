
const { ChatOpenAI } = require("@langchain/openai");
require("dotenv").config();

async function test() {
  const llm = new ChatOpenAI({
    openAIApiKey: process.env.LLM_API_KEY,
    configuration: { baseURL: process.env.LLM_BASE_URL },
    modelName: "qwen3.8-max",
    temperature: 0.7,
  });
  
  console.log("=== qwen3.8-max 思考模式测试 ===");
  const r = await llm.invoke("一个水池，进水管3小时放满，出水管5小时放空，同时开多久放满？简单回答");
  console.log("content:", r.content.substring(0, 200));
  console.log("\nresponse_metadata:", JSON.stringify(r.response_metadata, null, 2));
  console.log("\nadditional_kwargs:", JSON.stringify(r.additional_kwargs, null, 2));
  
  // 检查是否有 reasoning_content
  const rAny = r;
  console.log("\nreasoning_content:", rAny.reasoning_content ? rAny.reasoning_content.substring(0, 200) : "(无)");
  console.log("\n所有keys:", Object.keys(rAny));
}

test().catch(console.error);
