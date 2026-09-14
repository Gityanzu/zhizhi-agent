import { execFile, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  images: string[]; // base64-encoded images
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
  let timeout = 30000;

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
        timeout = 120000; // 放宽超时
      }
      fs.writeFileSync(filePath, code, 'utf-8');
      cmd = 'python';
      args = [filePath];
    } else {
      filePath = path.join(tmpDir, 'script.mjs');
      fs.writeFileSync(filePath, code, 'utf-8');
      cmd = 'node';
      args = [filePath];
    }

    // 执行代码
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      execFile(cmd, args, {
        cwd: tmpDir,
        timeout,
        maxBuffer: 5 * 1024 * 1024, // 5MB
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      }, (error, stdout, stderr) => {
        let exitCode = 0;
        if (error) {
          exitCode = typeof (error as any).code === 'number' ? (error as any).code : 1;
          if ((error as any).killed) {
            stderr = (stderr || '') + '\n[执行超时，已强制终止]';
          }
        }
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode });
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
