
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
  
  // 20x20 红色 PNG 的 base64
  const redImage = "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0XAAAAOklEQVR42mP8z8BQz0AEYBxYBFbABTjB1IAKsQqsAqVAFbABTjB1IAKsQqsAqVAFbABTjB1IAKsAp8H8gQd7P8QAAAABJRU5ErkJggg==";
  
  try {
    const response = await llm.invoke([
      new HumanMessage({
        content: [
          { type: "text", text: "描述这张图片的内容和颜色" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${redImage}` } },
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
