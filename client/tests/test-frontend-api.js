/**
 * 测试前端 API 调用
 */

const BASE_URL = 'http://localhost:5174'; // Vite dev server

async function testFrontendAPI() {
  console.log('🔍 测试前端 API 调用（通过 Vite 代理）\n');
  
  // 1. 健康检查
  console.log('1️⃣ 健康检查...');
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthData = await healthRes.json();
    console.log('   ✅ 状态码:', healthRes.status);
    console.log('   响应:', healthData.status);
  } catch (error) {
    console.log('   ❌ 失败:', error.message);
  }
  
  // 2. 注册测试
  console.log('\n2️⃣ 注册测试...');
  try {
    const username = `frontend_test_${Date.now()}`;
    const email = `frontend_${Date.now()}@test.com`;
    const password = 'Test123456!';
    
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    
    console.log('   状态码:', registerRes.status);
    
    if (registerRes.ok) {
      console.log('   ✅ 注册成功');
    } else {
      const errorText = await registerRes.text();
      console.log('   ❌ 错误:', errorText);
    }
  } catch (error) {
    console.log('   ❌ 异常:', error.message);
  }
  
  // 3. 登录测试
  console.log('\n3️⃣ 登录测试...');
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: 'testuser_auto', 
        password: 'Test123456!' 
      })
    });
    
    console.log('   状态码:', loginRes.status);
    
    if (loginRes.ok) {
      const data = await loginRes.json();
      console.log('   ✅ 登录成功');
      console.log('   Token:', data.token.substring(0, 50) + '...');
    } else {
      const errorText = await loginRes.text();
      console.log('   ❌ 错误:', errorText);
    }
  } catch (error) {
    console.log('   ❌ 异常:', error.message);
  }
  
  // 4. 用户设置（需要 token）
  console.log('\n4️⃣ 用户设置测试...');
  try {
    // 先获取 token
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: 'testuser_auto', 
        password: 'Test123456!' 
      })
    });
    
    if (loginRes.ok) {
      const loginData = await loginRes.json();
      const token = loginData.token;
      
      const settingsRes = await fetch(`${BASE_URL}/api/user/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log('   状态码:', settingsRes.status);
      
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        console.log('   ✅ 获取成功');
        console.log('   用户角色:', settingsData.profile?.role);
      } else {
        const errorText = await settingsRes.text();
        console.log('   ❌ 错误:', errorText.substring(0, 200));
      }
    }
  } catch (error) {
    console.log('   ❌ 异常:', error.message);
  }
}

testFrontendAPI().catch(console.error);
