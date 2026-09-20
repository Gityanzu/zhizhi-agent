const http = require('http');

const data = JSON.stringify({
  message: '1200的15%是多少？',
  useAgent: true,
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/chat/send',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
  timeout: 60000,
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('状态码:', res.statusCode);
    try {
      const result = JSON.parse(body);
      console.log('\n回答:', result.answer);
      console.log('\n执行步骤:');
      result.steps.forEach((step, i) => {
        const content = step.content.length > 100 
          ? step.content.substring(0, 100) + '...' 
          : step.content;
        console.log(`  ${i + 1}. [${step.type}] ${content}`);
      });
    } catch (e) {
      console.log('响应:', body);
    }
  });
});

req.on('error', (e) => {
  console.error('请求失败:', e.message);
});

req.on('timeout', () => {
  console.error('请求超时');
  req.destroy();
});

req.write(data);
req.end();
