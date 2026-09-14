
async function test() {
  const url = 'https://www.baidu.com/s?wd=深圳天气';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Cookie': 'BAIDUID=test123',
    }
  });
  const html = await res.text();
  console.log('HTML长度:', html.length);
  console.log('前500字符:', html.substring(0, 500));
  console.log('\n是否包含验证:', html.includes('验证') || html.includes('captcha') || html.includes('wappass'));
  console.log('是否包含结果:', html.includes('result') || html.includes('c-container'));
}
test().catch(console.error);
