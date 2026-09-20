/**
 * 前端功能完整测试 - 捕捉所有错误
 */

const BASE_URL = 'http://localhost:5174';

async function testFrontend() {
  console.log('🚀 开始前端功能测试\n');
  
  // 1. 测试模型加载
  console.log('=== 1️⃣ 测试模型加载 ===');
  try {
    const modelRes = await fetch(`${BASE_URL}/api/model/current`);
    const modelData = await modelRes.json();
    console.log('✅ 当前模型:', modelData.model?.name || 'N/A');
    console.log('   Model ID:', modelData.model?.id);
  } catch (error) {
    console.log('❌ 模型加载失败:', error.message);
  }
  
  // 2. 测试消息发送（SSE）
  console.log('\n=== 2️⃣ 测试 SSE 流式消息 ===');
  try {
    const sessionId = 'test_' + Date.now();
    const response = await fetch(`${BASE_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '你好',
        sessionId: sessionId,
        mode: 'agent',
        enableThinking: false
      }),
      signal: AbortSignal.timeout(30000)
    });
    
    console.log('响应状态:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ 响应错误:', errorText);
      return;
    }
    
    // 读取 SSE 流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;
    
    console.log('\n📡 接收 SSE 数据...\n');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        
        try {
          const chunk = JSON.parse(dataStr);
          chunkCount++;
          
          console.log(`[${chunkCount}] Type: ${chunk.type}`);
          if (chunk.content) {
            console.log('    Content:', chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : ''));
          }
          if (chunk.type === 'token') {
            console.log('    💬 这是 token 数据！');
          }
        } catch (e) {
          console.log('    ❌ 解析失败:', e.message);
        }
      }
    }
    
    console.log('\n✅ SSE 流接收完成，共接收', chunkCount, '个数据块');
    
  } catch (error) {
    console.log('❌ SSE 请求失败:', error.message);
    console.log('   Stack:', error.stack);
  }
}

// 运行测试
testFrontend().catch(console.error);
