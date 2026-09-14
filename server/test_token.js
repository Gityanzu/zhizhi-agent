
const { ChatOpenAI } = require("@langchain/openai");
require("dotenv").config();

const llm = new ChatOpenAI({
  openAIApiKey: process.env.LLM_API_KEY,
  configuration: { baseURL: process.env.LLM_BASE_URL },
  modelName: process.env.LLM_MODEL_NAME || "qwen3.8-flash",
  temperature: 0.7,
});

async function test() {
  const response = await llm.invoke("你好");
  console.log("=== 完整响应结构 ===");
  console.log(JSON.stringify(response, null, 2));
  console.log("\n=== response_metadata ===");
  console.log(JSON.stringify(response.response_metadata, null, 2));
  console.log("\n=== additional_kwargs ===");
  console.log(JSON.stringify(response.additional_kwargs, null, 2));
}

test().catch(console.error);
