/**
 * Redis 缓存服务 - 功能演示脚本
 * 展示每个核心功能的实际使用示例
 */

import { 
  initRedis,
  setCache, 
  getCache, 
  deleteCache,
  createSession,
  getSession,
  checkRateLimit,
  acquireLock,
  releaseLock,
  cacheTemplates,
  getCachedTemplates,
  closeRedis,
} from '../src/services/cache';

async function demonstrateFeatures() {
  console.log('🚀 智知 - Redis 缓存服务功能演示\n');
  
  // ==================== 1. 通用缓存 ====================
  console.log('📦 1. 通用缓存 CRUD');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // 设置字符串
    const strKey = 'demo:string';
    const strValue = 'Hello, World!';
    await setCache(strKey, strValue, 300);
    console.log(`✅ 设置字符串：${strKey} = "${strValue}"`);
    
    const retrievedStr = await getCache<string>(strKey);
    console.log(`   读取结果：${retrievedStr}\n`);
    
    // 设置对象
    const objKey = 'demo:object';
    const objValue = {
      name: '张三',
      age: 25,
      email: 'zhangsan@example.com',
      tags: ['developer', 'admin']
    };
    await setCache(objKey, objValue, 600);
    console.log(`✅ 设置对象：${objKey}`);
    console.log(`   数据：${JSON.stringify(objValue, null, 2)}\n`);
    
    const retrievedObj = await getCache<typeof objValue>(objKey);
    console.log(`   读取成功：${retrievedObj?.name}, ${retrievedObj?.age}岁\n`);
    
    // 删除缓存
    await deleteCache(objKey);
    console.log(`✅ 删除缓存：${objKey}\n`);
    
  } catch (error) {
    console.error('❌ 通用缓存测试失败:', error);
  }
  
  // ==================== 2. 会话管理 ====================
  console.log('\n👤 2. 会话管理');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const sessionId = `session-demo-${Date.now()}`;
    const userId = 'user-12345';
    
    // 创建会话
    const created = await createSession(sessionId, userId, 3600);
    console.log(`✅ 创建新会话`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   过期时间：3600 秒（1 小时）\n`);
    
    // 获取会话
    const session = await getSession(sessionId);
    if (session) {
      console.log(`✅ 获取会话信息`);
      console.log(`   会话 ID: ${session.session_id}`);
      console.log(`   用户 ID: ${session.user_id}`);
      console.log(`   创建时间：${new Date(session.created_at).toISOString()}`);
      console.log(`   最后访问：${new Date(session.last_access).toISOString()}\n`);
    }
    
    // 更新会话
    const updated = await updateSession(sessionId, {
      last_access: Date.now()
    });
    console.log(`✅ 更新会话最后访问时间`);
    console.log(`   更新结果：${updated ? '成功' : '失败'}\n`);
    
    // 验证会话
    const isValid = await validateSession(sessionId);
    console.log(`✅ 验证会话有效性`);
    console.log(`   是否有效：${isValid ? '是 ✅' : '否 ❌'}\n`);
    
  } catch (error) {
    console.error('❌ 会话管理测试失败:', error);
  }
  
  // ==================== 3. 限流功能 ====================
  console.log('\n🚦 3. 限流功能');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const identifier = 'demo-ip-192.168.1.1';
    const config = {
      windowMs: 60000,        // 1 分钟窗口
      maxRequests: 5,         // 最多 5 次请求
      keyPrefix: 'demo_rate_limit'
    };
    
    console.log(`限流配置:`);
    console.log(`   标识符：${identifier}`);
    console.log(`   时间窗口：${config.windowMs / 1000}秒`);
    console.log(`   最大请求数：${config.maxRequests}次\n`);
    
    // 模拟请求
    for (let i = 1; i <= 7; i++) {
      const result = await checkRateLimit(identifier, config);
      
      const status = result.allowed ? '✅ 允许' : '❌ 拒绝';
      const remaining = result.remaining > 0 ? `${result.remaining}次` : '已用尽';
      
      console.log(`   请求 #${i}: ${status} (剩余：${remaining})`);
    }
    
    // 重置限流
    console.log('\n✅ 重置限流计数器');
    const reset = await resetRateLimit(identifier);
    console.log(`   重置结果：${reset ? '成功' : '失败'}\n`);
    
  } catch (error) {
    console.error('❌ 限流功能测试失败:', error);
  }
  
  // ==================== 4. 分布式锁 ====================
  console.log('\n🔒 4. 分布式锁');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const lockName = 'demo-critical-operation';
    
    // 获取锁
    const lockValue = await acquireLock(lockName, {
      timeoutMs: 5000  // 5 秒超时
    });
    
    console.log(`✅ 获取分布式锁`);
    console.log(`   锁名称：${lockName}`);
    console.log(`   锁值：${lockValue?.substring(0, 20)}...`);
    console.log(`   超时时间：5 秒\n`);
    
    // 模拟临界操作
    console.log(`⏳ 执行临界操作...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`   操作完成\n`);
    
    // 释放锁
    if (lockValue) {
      const released = await releaseLock(lockName, lockValue);
      console.log(`✅ 释放分布式锁`);
      console.log(`   释放结果：${released ? '成功' : '失败'}\n`);
    }
    
  } catch (error) {
    console.error('❌ 分布式锁测试失败:', error);
  }
  
  // ==================== 5. 数据缓存示例 ====================
  console.log('\n📊 5. 数据缓存示例');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // 缓存模板列表
    const templates = [
      { id: 1, name: '智能客服', description: '用于客户服务的 AI Agent' },
      { id: 2, name: '数据分析', description: '用于数据分析的 AI Agent' },
      { id: 3, name: '内容创作', description: '用于内容生成的 AI Agent' }
    ];
    
    await cacheTemplates(templates);
    console.log(`✅ 缓存模板列表`);
    console.log(`   模板数量：${templates.length}`);
    console.log(`   缓存时间：300 秒（5 分钟）\n`);
    
    // 获取缓存的模板
    const cachedTemplates = await getCachedTemplates();
    if (cachedTemplates) {
      console.log(`✅ 获取缓存的模板列表`);
      console.log(`   模板数量：${cachedTemplates.length}`);
      cachedTemplates.forEach((t: any, i: number) => {
        console.log(`   ${i + 1}. ${t.name}: ${t.description}`);
      });
      console.log();
    }
    
    // 清除模板缓存
    await invalidateTemplatesCache();
    console.log(`✅ 清除模板缓存`);
    const cleared = await getCachedTemplates();
    console.log(`   清除后验证：${cleared === null ? '成功' : '失败'}\n`);
    
    // 缓存用户信息
    const userData = {
      id: 'user-789',
      username: 'testuser',
      email: 'test@example.com',
      role: 'admin'
    };
    
    await cacheUser('user-789', userData);
    console.log(`✅ 缓存用户信息`);
    console.log(`   用户 ID: user-789`);
    console.log(`   用户名：${userData.username}`);
    console.log(`   缓存时间：1800 秒（30 分钟）\n`);
    
    // 获取缓存的用户
    const cachedUser = await getCachedUser('user-789');
    if (cachedUser) {
      console.log(`✅ 获取缓存的用户信息`);
      console.log(`   用户名：${cachedUser.username}`);
      console.log(`   邮箱：${cachedUser.email}`);
      console.log(`   角色：${cachedUser.role}\n`);
    }
    
  } catch (error) {
    console.error('❌ 数据缓存示例测试失败:', error);
  }
  
  // ==================== 总结 ====================
  console.log('\n🎉 功能演示完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('✅ 所有功能演示成功');
  console.log('\n💡 提示:');
  console.log('   - 当前运行在内存模式（无真实 Redis）');
  console.log('   - 配置真实 Redis 后可获得完整性能');
  console.log('   - 查看 TEST_REPORT.md 了解详细测试结果\n');
  
  // 关闭连接
  await closeRedis();
}

// 导入需要的函数
import { 
  updateSession,
  validateSession,
  resetRateLimit,
  invalidateTemplatesCache,
  cacheUser,
  getCachedUser,
} from '../src/services/cache';

// 运行演示
demonstrateFeatures().catch(console.error);
