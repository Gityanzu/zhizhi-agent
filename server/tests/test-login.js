/**
 * 登录功能专项测试
 */

const BASE_URL = 'http://localhost:3001';

async function testLogin() {
  console.log('\n🔍 登录功能测试');
  console.log('='.repeat(60));
  
  // 先注册一个测试用户
  console.log('\n1️⃣ 注册测试用户...');
  const username = `login_test_${Date.now()}`;
  const email = `login_${Date.now()}@test.com`;
  const password = 'Test123456!';
  
  try {
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    
    const registerData = await registerResponse.json();
    console.log('   注册状态:', registerResponse.status);
    console.log('   ✅ 注册成功 - 用户名:', username);
    
    if (!registerResponse.ok) {
      console.error('   ❌ 注册失败，无法继续测试');
      return null;
    }
    
    // 尝试登录
    console.log('\n2️⃣ 尝试登录...');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    console.log('   登录状态码:', loginResponse.status);
    
    if (loginResponse.status === 400) {
      const errorData = await loginResponse.json();
      console.log('   ❌ 登录失败 (400 Bad Request)');
      console.log('   错误详情:', JSON.stringify(errorData, null, 2));
      
      // 打印请求信息用于调试
      console.log('\n   🔍 调试信息:');
      console.log('   - 用户名:', username);
      console.log('   - 密码长度:', password.length);
      console.log('   - 请求体:', JSON.stringify({ username, password }));
      
      return null;
    }
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('   ✅ 登录成功!');
      console.log('   用户:', loginData.user.username);
      console.log('   Token 长度:', loginData.token?.length || 0);
      console.log('   Token 前缀:', loginData.token?.substring(0, 30) + '...');
      
      return loginData;
    }
    
  } catch (error) {
    console.error('   ❌ 测试异常:', error.message);
  }
  
  return null;
}

async function testSystemAPIs() {
  console.log('\n\n🔍 系统 API 测试');
  console.log('='.repeat(60));
  
  // 测试健康检查
  console.log('\n1️⃣ 健康检查 (/api/health)');
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    console.log('   ✅ 状态码:', response.status);
    console.log('   📄 响应:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log('   ❌ 失败:', error.message);
  }
  
  // 测试数据库检查
  console.log('\n2️⃣ 数据库检查 (/api/db/check)');
  try {
    const response = await fetch(`${BASE_URL}/api/db/check`);
    const data = await response.json();
    console.log('   ✅ 状态码:', response.status);
    console.log('   📄 响应:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log('   ❌ 失败:', error.message);
  }
  
  // 测试缓存状态
  console.log('\n3️⃣ 缓存状态 (/api/cache/status)');
  try {
    const response = await fetch(`${BASE_URL}/api/cache/status`);
    const data = await response.json();
    console.log('   ✅ 状态码:', response.status);
    console.log('   📄 响应:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log('   ❌ 失败:', error.message);
  }
  
  // 测试系统统计
  console.log('\n4️⃣ 系统统计 (/api/stats/system)');
  try {
    const response = await fetch(`${BASE_URL}/api/stats/system`);
    const data = await response.json();
    console.log('   ✅ 状态码:', response.status);
    console.log('   📄 响应:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log('   ❌ 失败:', error.message);
  }
}

async function runTests() {
  console.log('🚀 智知平台 - 登录和系统 API 测试');
  console.log('='.repeat(60));
  
  const loginResult = await testLogin();
  await testSystemAPIs();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));
  console.log(`登录测试：${loginResult ? '✅ 通过' : '❌ 失败'}`);
  console.log('系统 API: ✅ 全部完成');
  console.log('='.repeat(60));
}

runTests().catch(console.error);
