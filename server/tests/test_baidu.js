
async function test() {
  const url = 'https://www.baidu.com/s?wd=深圳天气&rn=3';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    }
  });
  const html = await res.text();
  
  // 查找包含摘要的class
  const classes = ['c-abstract', 'content-right', 'c-span-last', 'result-op', 'c-color-text'];
  for (const cls of classes) {
    const regex = new RegExp('class="[^"]*' + cls + '[^"]*"', 'g');
    const matches = html.match(regex);
    console.log(cls + ':', matches ? matches.length + ' 个匹配' : '无匹配');
  }
  
  // 提取前2000字符看看结构
  console.log('\nHTML片段（搜索结果区域）:');
  const idx = html.indexOf('c-title');
  if (idx > -1) {
    console.log(html.substring(idx, idx + 1500));
  }
}
test().catch(console.error);
