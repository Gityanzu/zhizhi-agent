/**
 * 完整功能测试脚本
 */

const BASE_URL = 'http://localhost:3001';

let authToken = null;
let testUser = null;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testHealth() {
  console.log('\n📋 测试 1: 健康检查');
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    console.log('   ✅ 状态码:', res.status);
    console.log('   📊 响应:', JSON.stringify(data, null, 2));
    return res.ok;
  } catch (error) {
    console.log('   ❌ 失败:', error.message);
    return false;
  }
}

async function testRegister() {
  console.log('\n📋 测试 2: 用户注册');
  try {
    const username = `test_user_${Date.now()}`;
    const email = `test_${Date.now()}@example.com`;
    const password = 'Test123456!';
    
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    
    const data = await res.json();
    console.log('   ✅ 状态码:', res.status);
    
    if (res.ok) {
      testUser = { username, email, password };
      authToken = data.token;
      console.log('   ✅ 注册成功');
      console.log('   👤 用户:', username);
      console.log('   🔑 Token:', data.token.substring(0, 50) + '...');
      return true;
    } else {
      console.log('   ❌ 注册失败:', data.error);
      return false;
    }
  } catch (error) {
    console.log('   ❌ 异常:', error.message);
    return false;
  }
}

async function testLogin() {
  console.log('\n📋 测试 3: 用户登录');
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUser.username, password: testUser.password })
    });
    
    const data = await res.json();
    console.log('   ✅ 状态码:', res.status);
    
    if (res.ok) {
      console.log('   ✅ 登录成功');
      console.log('   👤 用户:', data.user.username);
      authToken = data.token;
      console.log('   🔑 Token:', data.token.substring(0, 50) + '...');
      return true;
    } else {
      console.log('   ❌ 登录失败:', data.error);
      return false;
    }
  } catch (error) {
    console.log('   ❌ 异常:', error.message);
    return false;
  }
}

async function testSession() {
  console.log('\n📋 测试 4: 会话管理');
  try {
    // 创建会话
    const createRes = await fetch(`${BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ title: '测试会话' })
    });
    
    const createData = await createRes.json();
    console.log('   创建会话 - 状态码:', createRes.status);
    
    if (createRes.ok) {
      console.log('   ✅ 会话创建成功');
      const sessionId = createData.id;
      
      // 发送消息
      const msgRes = await fetch(`${BASE_URL}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          sessionId,
          message: '你好',
          mode: 'agent'
        })
      });
      
      const msgData = await msgRes.json();
      console.log('   发送消息 - 状态码:', msgRes.status);
      
      if (msgRes.ok) {
        console.log('   ✅ 消息发送成功');
        
        // 获取会话列表
        const listRes = await fetch(`${BASE_URL}/api/sessions`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const listData = await listRes.json();
        console.log('   获取会话列表 - 状态码:', listRes.status);
        
        if (listRes.ok) {
          console.log('   ✅ 会话列表获取成功');
          console.log('   📝 会话数量:', listData.length);
          return true;
        }
      }
    }
    
    console.log('   ❌ 会话操作失败');
    return false;
  } catch (error) {
    console.log('   ❌ 异常:', error.message);
    return false;
  }
}

async function testAgentMarket() {
  console.log('\n📋 测试 5: Agent 市场');
  try {
    const res = await fetch(`${BASE_URL}/api/agents`);
    const data = await res.json();
    
    console.log('   ✅ 状态码:', res.status);
    console.log('   🤖 Agent 数量:', data.length);
    
    if (data.length > 0) {
      console.log('   📝 示例 Agent:', data[0].name);
      return true;
    }
    return true; // 即使没有 Agent 也算成功
  } catch (error) {
    console.log('   ❌ 异常:', error.message);
    return false;
  }
}

async function testStats() {
  console.log('\n📋 测试 6: 系统统计');
  try {
    const res = await fetch(`${BASE_URL}/api/stats/system`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await res.json();
    console.log('   ✅ 状态码:', res.status);
    
    if (res.ok) {
      console.log('   📊 统计数据:', JSON.stringify(data.counts, null, 2));
      return true;
    }
    
    console.log('   ❌ 获取失败:', data.error);
    return false;
  } catch (error) {
    console.log('   ❌ 异常:', error.message);
    return false;
  }
}

async function testSearch() {
  console.log('\n📋 测试 7: 搜索功能');
  try {
    const res = await fetch(`${BASE_URL}/api/agent-market/search?q=test&pageSize=10`);
    const data = await res.json();
    
    console.log('   ✅ 状态码:', res.status);
    console.log('   🔍 搜索结果数量:', data.data?.results?.length || 0);
    
    return res.ok;
  } catch (error) {
    console.log('   ❌ 异常:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('═'.repeat(60));
  console.log(' 智知 Agent 平台 - 完整功能测试');
  console.log('═'.repeat(60));
  console.log(`🕐 测试时间：${new Date().toLocaleString('zh-CN')}`);
  console.log(`🌐 API 地址：${BASE_URL}`);
  console.log('═'.repeat(60));
  
  const results = {};
  
  // 运行所有测试
  results.health = await testHealth();
  await sleep(500);
  
  results.register = await testRegister();
  await sleep(500);
  
  results.login = await testLogin();
  await sleep(500);
  
  results.session = await testSession();
  await sleep(500);
  
  results.agentMarket = await testAgentMarket();
  await sleep(500);
  
  results.stats = await testStats();
  await sleep(500);
  
  results.search = await testSearch();
  
  // 输出测试结果汇总
  console.log('\n' + '═'.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('═'.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const [testName, result] of Object.entries(results)) {
    const status = result ? '✅' : '❌';
    const symbol = result ? '通过' : '失败';
    console.log(`${status} ${testName.padEnd(15)} ${symbol}`);
    
    if (result) passed++;
    else failed++;
  }
  
  console.log('═'.repeat(60));
  console.log(`📈 总计：${passed} 通过 | ${failed} 失败`);
  console.log(`🎯 成功率：${((passed / Object.keys(results).length) * 100).toFixed(1)}%`);
  console.log('═'.repeat(60));
  
  if (failed === 0) {
    console.log('\n🎉 所有测试通过！系统运行正常！');
  } else {
    console.log(`\n⚠️ 有 ${failed} 个测试失败，请检查日志。`);
  }
}

runAllTests().catch(console.error);
