
async function test() {
  const urls = [
    'https://www.baidu.com',
    'https://html.duckduckgo.com',
    'https://www.bing.com',
  ];
  
  for (const url of urls) {
    try {
      const start = Date.now();
      const res = await fetch(url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      console.log(url, '->', res.status, '耗时', Date.now() - start, 'ms');
    } catch(e) {
      console.log(url, '-> 失败:', e.message);
    }
  }
}
test();
