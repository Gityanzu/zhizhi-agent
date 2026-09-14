
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
  
  // 创建一个简单的测试图片（1x1 红色像素的 base64）
  const redPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  
  try {
    const response = await llm.invoke([
      new HumanMessage({
        content: [
          { type: "text", text: "这张图片是什么颜色？" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${redPixel}` } },
        ],
      }),
    ]);
    console.log("回答:", response.content);
    console.log("成功！qwen3.5-ocr 支持图片输入");
  } catch(e) {
    console.log("错误:", e.message);
    console.log("可能不支持图片输入或模型名称不对");
  }
}

test().catch(console.error);
