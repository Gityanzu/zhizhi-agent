/**
 * 测试前端代理功能
 */

const BASE_URL = 'http://localhost:5173'; // Vite dev server

async function testProxy() {
  console.log('🔍 测试前端代理\n');
  
  // 1. 健康检查
  console.log('1️⃣ 健康检查...');
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthData = await healthRes.json();
    console.log('   ✅ 状态码:', healthRes.status);
    console.log('   响应:', healthData.status);
  } catch (error) {
    console.log('   ❌ 失败:', error.message);
    return;
  }
  
  // 2. 注册新用户
  const username = `proxy_${Date.now()}`;
  const email = `proxy_${Date.now()}@test.com`;
  const password = 'Test123456!';
  
  console.log('\n2️⃣ 通过代理注册...');
  try {
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    
    const registerData = await registerRes.json();
    console.log('   状态码:', registerRes.status);
    
    if (!registerRes.ok) {
      console.log('   ❌ 注册失败:', registerData);
      return;
    }
    console.log('   ✅ 注册成功');
  } catch (error) {
    console.log('   ❌ 注册异常:', error.message);
    return;
  }
  
  // 3. 通过代理登录
  console.log('\n3️⃣ 通过代理登录...');
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const loginData = await loginRes.json();
    console.log('   状态码:', loginRes.status);
    
    if (loginRes.ok) {
      console.log('   ✅ 登录成功');
      console.log('   Token:', loginData.token.substring(0, 50) + '...');
    } else {
      console.log('   ❌ 登录失败:', loginData);
    }
  } catch (error) {
    console.log('   ❌ 登录异常:', error.message);
  }
}

testProxy().catch(console.error);
