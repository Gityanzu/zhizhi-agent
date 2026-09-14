const http = require('http');

const data = JSON.stringify({
  message: '你好，请简单介绍一下你自己',
  useAgent: false,
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
    console.log('完整响应:', body);
  });
});

req.on('error', (e) => {
  console.error('请求失败:', e.message);
});

req.write(data);
req.end();
