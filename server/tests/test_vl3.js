
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage } = require("@langchain/core/messages");
require("dotenv").config();

async function test() {
  const llm = new ChatOpenAI({
    openAIApiKey: process.env.LLM_API_KEY,
    configuration: { baseURL: process.env.LLM_BASE_URL },
    modelName: "qwen3.5-ocr",
    temperature: 0.1,
  });
  
  const imgBase64 = "";
  
  try {
    const response = await llm.invoke([
      new HumanMessage({
        content: [
          { type: "text", text: "描述这张图片中有什么形状和颜色" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${imgBase64}` } },
        ],
      }),
    ]);
    console.log("回答:", response.content);
    console.log("\n成功！qwen3.5-ocr 支持图片输入");
  } catch(e) {
    console.log("错误:", e.message);
  }
}

test().catch(console.error);
