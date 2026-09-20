/**
 * 直接测试登录 API
 */

async function testLogin() {
  console.log('🔍 直接测试登录 API\n');
  
  // 注册新用户
  console.log('1️⃣ 注册...');
  const username = `api_test_${Date.now()}`;
  const email = `api_${Date.now()}@test.com`;
  const password = 'Test123456!';
  
  const registerRes = await fetch('http://localhost:3001/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  
  const registerData = await registerRes.json();
  console.log('   注册状态:', registerRes.status);
  console.log('   响应:', registerData.token ? '✅ 成功' : '❌ 失败:', registerData.error || '');
  
  if (!registerRes.ok) {
    console.log('   详细信息:', JSON.stringify(registerData, null, 2));
    return;
  }
  
  // 尝试登录
  console.log('\n2️⃣ 登录...');
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const loginData = await loginRes.json();
  console.log('   登录状态:', loginRes.status);
  console.log('   响应:', loginRes.ok ? '✅ 成功' : '❌ 失败');
  console.log('   错误信息:', loginData.error || '');
  
  if (loginRes.ok) {
    console.log('\n🎉 登录成功！');
    console.log('   用户:', loginData.user.username);
    console.log('   Token:', loginData.token.substring(0, 50) + '...');
  } else {
    console.log('\n❌ 登录失败');
    console.log('   详细信息:', JSON.stringify(loginData, null, 2));
  }
}

testLogin().catch(console.error);
