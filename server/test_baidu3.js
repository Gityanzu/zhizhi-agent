
async function test() {
  const url = 'https://www.baidu.com/s?wd=深圳天气';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    }
  });
  const html = await res.text();
  
  // 查找 c-container 结果块
  const containerRegex = /<div[^>]*class="[^"]*c-container[^"]*"[^>]*>([\s\S]{0,2000}?)/g;
  let match;
  let count = 0;
  while ((match = containerRegex.exec(html)) !== null && count < 2) {
    console.log('=== 结果块', count + 1, '===');
    console.log(match[1].substring(0, 800));
    console.log('');
    count++;
  }
  console.log('总共找到', count, '个结果块');
}
test().catch(console.error);
