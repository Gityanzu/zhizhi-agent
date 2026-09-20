/**
 * 测试模型 API 直接调用
 */

async function testDirectAPI() {
  console.log('🔍 测试直接 API 调用\n');
  
  // 1. 测试 /api/model/list (通过代理)
  console.log('1️⃣ 测试 /api/model/list (通过 Vite 代理)...');
  try {
    const res1 = await fetch('/api/model/list');
    console.log('   状态:', res1.status);
    console.log('   Content-Type:', res1.headers.get('content-type'));
    
    const text1 = await res1.text();
    console.log('   前 200 字符:', text1.substring(0, 200));
    
    if (text1.startsWith('<!DOCTYPE')) {
      console.log('   ❌ 返回了 HTML，说明代理失败！');
    } else {
      const json = JSON.parse(text1);
      console.log('   ✅ 成功，models 数量:', json.models?.length || 0);
    }
  } catch (error) {
    console.log('   ❌ 错误:', error.message);
  }
  
  // 2. 测试 http://localhost:3001/api/model/list (直接后端)
  console.log('\n2️⃣ 测试 http://localhost:3001/api/model/list (直接后端)...');
  try {
    const res2 = await fetch('http://localhost:3001/api/model/list');
    console.log('   状态:', res2.status);
    console.log('   Content-Type:', res2.headers.get('content-type'));
    
    const text2 = await res2.text();
    console.log('   前 200 字符:', text2.substring(0, 200));
    
    if (text2.startsWith('<!DOCTYPE')) {
      console.log('   ❌ 返回了 HTML！');
    } else {
      const json = JSON.parse(text2);
      console.log('   ✅ 成功，models 数量:', json.models?.length || 0);
    }
  } catch (error) {
    console.log('   ❌ 错误:', error.message);
  }
}

testDirectAPI().catch(console.error);
