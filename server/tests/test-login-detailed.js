/**
 * 详细登录测试 - 捕获所有错误信息
 */

const BASE_URL = 'http://localhost:3001';

async function detailedLoginTest() {
  console.log('🔍 详细登录测试\n');
  
  // 注册新用户
  console.log('1️⃣ 注册测试用户...');
  const username = `debug_user_${Date.now()}`;
  const email = `debug_${Date.now()}@test.com`;
  const password = 'Test123456!';
  
  try {
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    
    const registerData = await registerRes.json();
    console.log('   ✅ 注册成功:', username);
    console.log('   Token:', registerData.token?.substring(0, 50) + '...');
    
    if (!registerRes.ok) {
      console.error('   ❌ 注册失败:', registerData);
      return;
    }
    
    // 尝试登录
    console.log('\n2️⃣ 尝试登录...');
    console.log('   用户名:', username);
    console.log('   密码:', password);
    
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const loginData = await loginRes.json();
    console.log('   登录状态:', loginRes.status);
    console.log('   响应数据:', JSON.stringify(loginData, null, 2));
    
    if (loginRes.ok) {
      console.log('   ✅ 登录成功！');
      console.log('   Token:', loginData.token?.substring(0, 50) + '...');
    } else {
      console.log('   ❌ 登录失败');
      if (loginData.error) {
        console.log('   错误信息:', loginData.error);
      }
      if (loginData.details) {
        console.log('   详细信息:', JSON.stringify(loginData.details, null, 2));
      }
    }
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    console.error(error.stack);
  }
}

detailedLoginTest().catch(console.error);
