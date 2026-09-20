/**
 * 测试数据库连接
 */

import db from './src/db';

console.log('🔍 测试数据库连接');
console.log('db 对象:', db ? '已初始化' : '未初始化');

if (db) {
  console.log('\n✅ 数据库已连接');
  
  // 尝试查询
  db.query('SELECT 1 as test')
    .then(result => {
      console.log('✅ 查询成功:', result.rows[0]);
    })
    .catch(error => {
      console.error('❌ 查询失败:', error.message);
    });
} else {
  console.log('\n❌ 数据库未初始化');
}
