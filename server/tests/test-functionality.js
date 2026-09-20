/**
 * 智知 Agent 平台 - 功能测试脚本
 */

const BASE_URL = 'http://localhost:3001';

async function testHealth() {
  console.log('\n🔍 测试 1: 健康检查');
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    console.log('✅ 状态码:', response.status);
    const data = await response.json();
    console.log('📄 响应数据:', JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ 健康检查失败:', error.message);
    return false;
  }
}

async function testDatabase() {
  console.log('\n🔍 测试 2: 数据库连接');
  try {
    const response = await fetch(`${BASE_URL}/api/db/check`);
    console.log('✅ 状态码:', response.status);
    const data = await response.json();
    console.log('📄 数据库状态:', JSON.stringify(data, null, 2));
    return response.ok;
  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message);
    return false;
  }
}

async function testAuth() {
  console.log('\n🔍 测试 3: 认证系统');
  
  // 注册新用户
  console.log('\n  📝 注册用户...');
  try {
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `test_user_${Date.now()}`,
        email: `test_${Date.now()}@example.com`,
        password: 'Test123456!'
      })
    });
    
    console.log('  ✅ 注册状态码:', registerResponse.status);
    const registerData = await registerResponse.json();
    console.log('  📄 注册响应:', registerData);
    
    if (registerResponse.ok) {
      // 登录
      console.log('\n  🔐 登录...');
      const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: registerData.username,
          password: 'Test123456!'
        })
      });
      
      console.log('  ✅ 登录状态码:', loginResponse.status);
      const loginData = await loginResponse.json();
      console.log('  📄 Token 长度:', loginData.token?.length || 0);
      
      if (loginResponse.ok && loginData.token) {
        console.log('  ✅ 认证成功!');
        return loginData.token;
      }
    }
  } catch (error) {
    console.error('  ❌ 认证测试失败:', error.message);
  }
  return null;
}

async function testSessions(token) {
  console.log('\n🔍 测试 4: 会话管理');
  
  if (!token) {
    console.log('  ⚠️  需要认证 token');
    return;
  }
  
  try {
    // 创建会话
    console.log('  📝 创建新会话...');
    const createResponse = await fetch(`${BASE_URL}/api/chat/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: '测试会话',
        mode: 'agent'
      })
    });
    
    console.log('  ✅ 创建状态码:', createResponse.status);
    const sessionData = await createResponse.json();
    console.log('  📄 会话 ID:', sessionData.id);
    
    if (createResponse.ok && sessionData.id) {
      // 获取会话列表
      console.log('\n  📋 获取会话列表...');
      const listResponse = await fetch(`${BASE_URL}/api/chat/sessions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('  ✅ 列表状态码:', listResponse.status);
      const sessions = await listResponse.json();
      console.log('  📄 会话数量:', sessions.length);
      
      // 发送消息
      console.log('\n  💬 发送消息...');
      const messageResponse = await fetch(`${BASE_URL}/api/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: sessionData.id,
          message: '你好，请介绍一下你自己'
        })
      });
      
      console.log('  ✅ 消息状态码:', messageResponse.status);
      const messageData = await messageResponse.json();
      console.log('  📄 响应内容长度:', messageData.content?.length || 0);
      
      console.log('  ✅ 会话管理测试完成!');
    }
  } catch (error) {
    console.error('  ❌ 会话测试失败:', error.message);
  }
}

async function testRedis() {
  console.log('\n🔍 测试 5: Redis 缓存');
  
  try {
    const response = await fetch(`${BASE_URL}/api/cache/status`);
    console.log('✅ 状态码:', response.status);
    const data = await response.json();
    console.log('📄 缓存状态:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ Redis 缓存状态检查完成!');
      return true;
    }
  } catch (error) {
    console.error('❌ Redis 测试失败:', error.message);
  }
  return false;
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('🚀 智知 Agent 平台 - 功能测试开始');
  console.log('='.repeat(60));
  
  const results = {
    health: await testHealth(),
    database: await testDatabase(),
    auth: await testAuth(),
    sessions: null,
    redis: null
  };
  
  if (results.auth) {
    results.sessions = await testSessions(results.auth);
  }
  
  results.redis = await testRedis();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));
  console.log(`健康检查：${results.health ? '✅' : '❌'}`);
  console.log(`数据库：${results.database ? '✅' : '❌'}`);
  console.log(`认证系统：${results.auth ? '✅' : '❌'}`);
  console.log(`会话管理：${results.sessions ? '✅' : '❌'}`);
  console.log(`Redis 缓存：${results.redis ? '✅' : '❌'}`);
  
  const passed = Object.values(results).filter(v => v !== null && v !== false).length;
  const total = Object.keys(results).length;
  
  console.log(`\n总计：${passed}/${total} 项通过`);
  console.log('='.repeat(60));
}

// 运行测试
runAllTests().catch(console.error);
