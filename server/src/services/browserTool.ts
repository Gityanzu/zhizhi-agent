import * as fs from 'fs';

// ==================== 浏览器工具（puppeteer-core + 系统 Chrome） ====================
// 设计原则：puppeteer-core 未安装或系统 Chrome 未找到时，所有工具返回友好提示，绝不崩溃。
// 多个操作（navigate/click/type/screenshot/extractText）共享同一个持久化页面。

let puppeteer: any = null;
let loadError: string | null = null;

try {
  // 动态 require：安装失败时不阻塞模块加载
  puppeteer = require('puppeteer-core');
} catch (e) {
  puppeteer = null;
  loadError = e instanceof Error ? e.message : String(e);
  console.warn('[browserTool] puppeteer-core 未安装，浏览器工具不可用');
}

// 检测系统 Chrome 路径（Windows 常见位置）
function detectChromePath(): string | null {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return null;
}

export function isBrowserAvailable(): boolean {
  return !!puppeteer && !!detectChromePath();
}

function notAvailableMessage(): string {
  if (!puppeteer) {
    return `浏览器工具不可用：未安装 puppeteer-core（${loadError || ''}）。请运行 npm install puppeteer-core。`;
  }
  if (!detectChromePath()) {
    return '浏览器工具不可用：未检测到系统 Chrome。请安装 Google Chrome 后重试。';
  }
  return '浏览器工具不可用';
}

let browserInstance: any = null;
let activePage: any = null;

async function getPage(): Promise<any> {
  if (!browserInstance || !browserInstance.connected) {
    const chromePath = detectChromePath();
    if (!chromePath) throw new Error('未找到系统 Chrome');
    browserInstance = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    browserInstance.on('disconnected', () => {
      browserInstance = null;
      activePage = null;
    });
  }
  if (!activePage || activePage.isClosed()) {
    activePage = await browserInstance.newPage();
    await activePage.setDefaultNavigationTimeout(10000);
    await activePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }
  return activePage;
}

// ==================== 工具函数 ====================

export async function webNavigate(url: string): Promise<string> {
  if (!isBrowserAvailable()) return notAvailableMessage();
  try {
    const page = await getPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    return `已打开页面：${title}\nURL: ${page.url()}\nHTTP状态: ${response?.status() || 'unknown'}`;
  } catch (e) {
    return `导航失败: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function webClick(selector: string): Promise<string> {
  if (!isBrowserAvailable()) return notAvailableMessage();
  try {
    const page = await getPage();
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.click(selector, { timeout: 5000 });
    return `已点击元素: ${selector}（当前URL: ${page.url()}）`;
  } catch (e) {
    return `点击失败: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function webType(selector: string, text: string): Promise<string> {
  if (!isBrowserAvailable()) return notAvailableMessage();
  try {
    const page = await getPage();
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.click({ timeout: 5000 });
    await page.type(selector, text, { delay: 20 });
    return `已在 ${selector} 输入文本（${text.length}字符）`;
  } catch (e) {
    return `输入失败: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function webScreenshot(): Promise<string> {
  if (!isBrowserAvailable()) return notAvailableMessage();
  try {
    const page = await getPage();
    const buffer = await page.screenshot({ encoding: 'base64' });
    // 返回带标记的 base64，前端可识别并渲染为图片
    return `[IMAGE_BASE64]${buffer}`;
  } catch (e) {
    return `截图失败: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function webExtractText(): Promise<string> {
  if (!isBrowserAvailable()) return notAvailableMessage();
  try {
    const page = await getPage();
    const text = await page.evaluate('() => (document.body ? document.body.innerText : "")');
    const truncated = text.length > 3000 ? text.slice(0, 3000) + '\n...（内容已截断）' : text;
    return `页面文本内容（URL: ${page.url()}）：\n${truncated}`;
  } catch (e) {
    return `提取文本失败: ${e instanceof Error ? e.message : String(e)}`;
  }
}
