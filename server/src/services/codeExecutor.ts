import { execFile, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { getAgentOutputDir } from './agentOutput';

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  images: string[]; // base64-encoded images
}

// 沙箱环境变量：剔除含密钥/凭据语义的变量，防止被测代码读取服务器机密（如 LLM_API_KEY）
const SECRET_ENV_RE = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|SESSION|API)/i;
function sanitizeEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (SECRET_ENV_RE.test(k)) continue;
    out[k] = v;
  }
  out.PYTHONUNBUFFERED = '1';
  // 强制子进程按 UTF-8 输出。中文 Windows 下 Python 的 stdout 会跟随系统代码页（GBK），
  // 而父进程是按 UTF-8 解码的，结果工具结果里凡是中文全变成乱码（实测出现
  // "ϵͳ����:" / "��ǰ����Ŀ¼:"）—— 模型看到的是坏数据，根本无法判断代码到底跑成功没有。
  // PYTHONUTF8 顺带把文件读写默认编码也统一成 UTF-8，避免读写中文文件名/内容出错。
  out.PYTHONIOENCODING = 'utf-8';
  out.PYTHONUTF8 = '1';
  // 沙箱的当前工作目录是临时目录且跑完即删，脚本要保留文件只能写绝对路径。
  // 这里给出唯一权威的输出根目录，模型照着拼即可，不必依赖它对历史路径的记忆。
  try {
    out.ZHI_OUTPUT_DIR = getAgentOutputDir();
  } catch {
    // 拿不到就不注入，模型会退回使用提示词里给出的路径
  }
  if (config.agent.codeSandboxNoNetwork) {
    // best-effort 外联阻断：代理指向黑洞地址（硬隔离由容器网络策略在 L3 提供）
    const sink = 'http://127.0.0.1:9';
    out.HTTP_PROXY = sink; out.HTTPS_PROXY = sink;
    out.http_proxy = sink; out.https_proxy = sink;
    out.NO_PROXY = ''; out.no_proxy = '';
  }
  return out;
}

// 缓存：matplotlib 是否已安装
let matplotlibChecked = false;
let matplotlibAvailable = false;

async function ensureMatplotlib(): Promise<boolean> {
  if (matplotlibChecked) return matplotlibAvailable;
  return new Promise((resolve) => {
    exec('python -c "import matplotlib; print(matplotlib.__version__)"', (error, stdout) => {
      if (!error && stdout.trim()) {
        matplotlibAvailable = true;
        matplotlibChecked = true;
        resolve(true);
      } else {
        // 尝试安装
        console.log('[codeExecutor] 正在安装 matplotlib...');
        exec('pip install matplotlib --quiet', { timeout: 120000 }, (installError) => {
          matplotlibChecked = true;
          matplotlibAvailable = !installError;
          if (installError) {
            console.warn('[codeExecutor] matplotlib 安装失败:', installError.message);
          } else {
            console.log('[codeExecutor] matplotlib 安装成功');
          }
          resolve(matplotlibAvailable);
        });
      }
    });
  });
}

export async function executeCode(
  code: string,
  language: 'python' | 'javascript'
): Promise<CodeExecutionResult> {
  const tmpDir = path.join(os.tmpdir(), `zhizhi_code_${uuidv4()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let filePath: string;
  let cmd: string;
  let args: string[];
  // 超时策略：原来固定 30s，对"顺手装个依赖"完全不够 —— 实测第 2 轮
  // `pip install python-docx` 在 30s 内装不完被判超时强制终止，白白烧掉一整轮对话，
  // 依赖只能靠后续轮次重试才装上。这里拆成两档，并允许用环境变量统一覆盖。
  const DEFAULT_TIMEOUT_MS = Number(process.env.CODE_EXEC_TIMEOUT_MS) || 120000;
  const INSTALL_TIMEOUT_MS = Number(process.env.CODE_EXEC_INSTALL_TIMEOUT_MS) || 300000;
  let timeout = DEFAULT_TIMEOUT_MS;
  // 装依赖类代码单独放宽：这是沙箱里最慢也最常见的一步
  const looksLikeInstall = /\b(pip3?|npm|yarn|pnpm|conda)\s+(install|i|add)\b|apt-get\s+install/i.test(code);
  if (looksLikeInstall) timeout = INSTALL_TIMEOUT_MS;

  // 检测 Python 可执行文件
  const getPythonCommand = () => {
    // Windows 优先使用 py 命令
    if (os.platform() === 'win32') {
      return 'py';
    }
    // macOS/Linux 尝试 python3，然后 python
    return 'python3';
  };

  try {
    if (language === 'python') {
      filePath = path.join(tmpDir, 'script.py');
      // 检查是否使用 matplotlib
      const usesMatplotlib = /matplotlib|plt\.|savefig/.test(code);
      if (usesMatplotlib) {
        const hasMpl = await ensureMatplotlib();
        if (hasMpl) {
          // 确保在非交互模式下运行，图形保存到文件
          code = `import matplotlib\nmatplotlib.use('Agg')\nimport matplotlib.pyplot as plt\n${code}`;
        }
        // matplotlib 可能还要现场安装，用最宽的一档；不覆盖上面的装依赖判定
        timeout = Math.max(timeout, INSTALL_TIMEOUT_MS);
      }
      fs.writeFileSync(filePath, code, 'utf-8');
      cmd = getPythonCommand();
      args = [filePath];
    } else {
      filePath = path.join(tmpDir, 'script.mjs');
      fs.writeFileSync(filePath, code, 'utf-8');
      cmd = 'node';
      // 限制 V8 堆上限，避免被测代码耗尽内存
      args = ['--max-old-space-size=256', filePath];
    }

    // 执行代码
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      console.log(`🐍 [${language}] 执行命令：${cmd} ${args.join(' ')}`);
      // 排查"改了输出目录却仍落到旧目录"：这一行能直接看出当前请求上下文里生效的是哪个目录
      console.log(`🐍 [${language}] 输出根目录：${getAgentOutputDir()}`);
      
      const childProcess = execFile(cmd, args, {
        cwd: tmpDir,
        timeout,
        maxBuffer: 5 * 1024 * 1024, // 5MB
        env: sanitizeEnv(),
      }, (error, stdout, stderr) => {
        let exitCode = 0;
        if (error) {
          exitCode = typeof (error as any).code === 'number' ? (error as any).code : 1;
          console.error(`❌ [${language}] 执行失败:`);
          console.error(`   错误信息:', error.message`);
          console.error(`   stdout:', stdout || '(空)'`);
          console.error(`   stderr:', stderr || '(空)'`);
          if ((error as any).killed) {
            stderr = (stderr || '') + '\n[执行超时，已强制终止]';
          }
        } else {
          console.log(`✅ [${language}] 执行成功:`);
          console.log(`   stdout:', stdout || '(无输出)'`);
        }
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode });
      });
      
      childProcess.on('error', (err) => {
        console.error(`💥 [${language}] 进程启动失败:`, err.message);
      });
    });

    // 扫描临时目录中的图片文件
    const images: string[] = [];
    try {
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg'].includes(ext)) {
          const imgPath = path.join(tmpDir, file);
          const stat = fs.statSync(imgPath);
          // 限制单张图片 2MB
          if (stat.size <= 2 * 1024 * 1024) {
            const base64 = fs.readFileSync(imgPath).toString('base64');
            const mime = ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1)}`;
            images.push(`data:${mime};base64,${base64}`);
          }
        }
      }
    } catch (e) {
      console.warn('[codeExecutor] 扫描图片失败:', e);
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      images,
    };
  } finally {
    // 清理临时目录
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  }
}
