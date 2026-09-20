/**
 * 测试登录功能详细诊断
 */

const BASE_URL = 'http://localhost:3001';

async function testLogin() {
  console.log('🔍 测试登录功能\n');
  
  // 1. 先注册一个新用户
  const username = `debug_${Date.now()}`;
  const email = `debug_${Date.now()}@test.com`;
  const password = 'Test123456!';
  
  console.log('1️⃣ 注册新用户...');
  try {
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    
    const registerData = await registerRes.json();
    console.log('   状态码:', registerRes.status);
    console.log('   响应:', registerData);
    
    if (!registerRes.ok) {
      console.log('   ❌ 注册失败');
      return;
    }
    console.log('   ✅ 注册成功\n');
  } catch (error) {
    console.log('   ❌ 注册异常:', error.message);
    return;
  }
  
  // 2. 尝试登录
  console.log('2️⃣ 尝试登录...');
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const loginData = await loginRes.json();
    console.log('   状态码:', loginRes.status);
    console.log('   响应:', loginData);
    
    if (loginRes.ok) {
      console.log('   ✅ 登录成功');
      console.log('   Token:', loginData.token.substring(0, 50) + '...');
    } else {
      console.log('   ❌ 登录失败');
    }
  } catch (error) {
    console.log('   ❌ 登录异常:', error.message);
  }
}

testLogin().catch(console.error);
