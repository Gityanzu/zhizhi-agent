/**
 * 详细测试会话和搜索功能
 */

const BASE_URL = 'http://localhost:3001';

async function testChat() {
  console.log('\n🔍 详细测试：发送消息\n');
  
  // 先登录
  const username = `debug_${Date.now()}`;
  const email = `debug_${Date.now()}@test.com`;
  const password = 'Test123456!';
  
  console.log('1️⃣ 注册...');
  const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  
  const registerData = await registerRes.json();
  console.log('   状态:', registerRes.status);
  
  if (!registerRes.ok) {
    console.log('   错误:', registerData);
    return;
  }
  
  console.log('   ✅ 注册成功');
  
  console.log('\n2️⃣ 登录...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const loginData = await loginRes.json();
  console.log('   状态:', loginRes.status);
  
  if (!loginRes.ok) {
    console.log('   错误:', loginData);
    return;
  }
  
  console.log('   ✅ 登录成功');
  const token = loginData.token;
  
  console.log('\n3️⃣ 创建会话...');
  const sessionRes = await fetch(`${BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ title: '调试会话' })
  });
  
  const sessionData = await sessionRes.json();
  console.log('   状态:', sessionRes.status);
  
  if (!sessionRes.ok) {
    console.log('   错误:', sessionData);
    return;
  }
  
  console.log('   ✅ 会话创建成功');
  const sessionId = sessionData.id;
  
  console.log('\n4️⃣ 发送消息...');
  const chatRes = await fetch(`${BASE_URL}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      sessionId,
      content: '你好',
      mode: 'chat'
    })
  });
  
  console.log('   状态:', chatRes.status);
  const chatText = await chatRes.text();
  console.log('   响应内容:', chatText.substring(0, 200));
  
  try {
    const chatData = JSON.parse(chatText);
    console.log('   ✅ 解析成功');
    console.log('   数据:', JSON.stringify(chatData, null, 2));
  } catch (e) {
    console.log('   ❌ JSON 解析失败');
  }
}

async function testSearch() {
  console.log('\n\n🔍 详细测试：搜索功能\n');
  
  const searchRes = await fetch(`${BASE_URL}/api/search?q=test&limit=10`);
  console.log('   状态:', searchRes.status);
  
  const searchText = await searchRes.text();
  console.log('   响应内容:', searchText.substring(0, 200));
  
  try {
    const searchData = JSON.parse(searchText);
    console.log('   ✅ 解析成功');
    console.log('   数据:', JSON.stringify(searchData, null, 2));
  } catch (e) {
    console.log('   ❌ JSON 解析失败');
  }
}

console.log('═'.repeat(60));
console.log(' 详细错误测试');
console.log('═'.repeat(60));

testChat().then(() => testSearch()).catch(console.error);
