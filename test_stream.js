const http = require('http');

const data = JSON.stringify({
  message: '现在几点了？',
  useAgent: true,
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/chat/stream',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

const req = http.request(options, (res) => {
  console.log('状态码:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  console.log('\n=== 流式响应 ===');
  
  let count = 0;
  res.on('data', (chunk) => {
    count++;
    const text = chunk.toString();
    console.log(`[块${count}]`, text.substring(0, 200));
  });
  
  res.on('end', () => {
    console.log('\n=== 响应结束，共', count, '块 ===');
  });
});

req.on('error', (e) => {
  console.error('请求失败:', e.message);
});

req.write(data);
req.end();
