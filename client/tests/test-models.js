/**
 * 测试模型 API
 */

const BASE_URL = 'http://localhost:5174'; // Vite dev server

async function testModels() {
  console.log('🔍 测试模型 API\n');
  
  // 1. 获取当前模型
  console.log('1️⃣ 获取当前模型...');
  try {
    const currentRes = await fetch(`${BASE_URL}/api/model/current`);
    const currentData = await currentRes.json();
    console.log('   状态码:', currentRes.status);
    console.log('   响应:', JSON.stringify(currentData, null, 2));
  } catch (error) {
    console.log('   ❌ 失败:', error.message);
  }
  
  // 2. 获取可用模型列表
  console.log('\n2️⃣ 获取可用模型列表...');
  try {
    const listRes = await fetch(`${BASE_URL}/api/model/list`);
    const listData = await listRes.json();
    console.log('   状态码:', listRes.status);
    console.log('   响应:', JSON.stringify(listData, null, 2));
  } catch (error) {
    console.log('   ❌ 失败:', error.message);
  }
  
  // 3. 获取提供商列表
  console.log('\n3️⃣ 获取提供商列表...');
  try {
    const providersRes = await fetch(`${BASE_URL}/api/model/providers`);
    const providersData = await providersRes.json();
    console.log('   状态码:', providersRes.status);
    console.log('   响应:', JSON.stringify(providersData, null, 2));
  } catch (error) {
    console.log('   ❌ 失败:', error.message);
  }
}

testModels().catch(console.error);
