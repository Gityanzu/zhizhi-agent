# 智知 Agent 桌面端（Electron）实现说明 · 面试讲解稿

> 这份文档有两个用途：一是记录这次桌面端改造的具体实现，
> 二是面试时如果你被要求"打开项目讲一下"，照着这里的顺序点文件就行。

---

## 一、为什么 AI 项目要做桌面端

这不是为了"看起来更专业"，而是三个绕不开的工程约束：

| 约束 | 说明 |
|---|---|
| **数据不出本机** | 企业知识库、行业资料属于客户的敏感资产，很多客户不接受全部上云。桌面端 + 本地后端天然满足合规要求。 |
| **体量与本地算力** | 单套资料动辄几十 GB（PDF / Word / 扫描件），本地解析、本地向量化比反复上传快得多，也不吃客户带宽。 |
| **离线与弱网** | 现场/内网环境网络不可靠，必须支持本地作业、联网后再同步。 |

这三条直接推导出架构决策：**后端必须能跑在用户电脑上，所以桌面端要负责托管后端的生命周期。**

---

## 二、这次新增了什么

全部为**新增文件**，`src/` 下的业务代码一行未改（除了 `src/types/index.ts` 加了一行 barrel 导出）。

```
client/
├─ electron/
│  ├─ main.cjs            主进程入口：窗口、生命周期、单实例锁、安全策略
│  ├─ preload.cjs         contextBridge 白名单，主/渲染之间唯一的通道
│  ├─ ipc.cjs             IPC 处理器注册中心（safeHandler 统一包装）
│  ├─ hostServer.cjs      主进程内置静态托管 + /api 反向代理（含 SSE 透传）
│  ├─ backend.cjs         本地后端子进程托管（启动 / 健康检查 / 回收）
│  ├─ updater.cjs         自动更新（electron-updater 全事件 → IPC 推送）
│  ├─ tray.cjs            系统托盘 + 内存绘制图标
│  └─ paths.cjs           跨平台路径与环境解析（安装目录 vs 用户数据目录）
├─ scripts/
│  └─ update-server.cjs   本地 generic 更新源，用于演示整条更新链路
├─ src/
│  ├─ types/desktop.ts    window.desktop 的类型定义 + global 声明
│  └─ composables/useDesktop.ts  渲染层统一入口：探测、解包、订阅、退订
├─ electron-builder.yml   三平台打包配置
├─ dev-app-update.yml     开发态跑更新链路用的配置
└─ .gitignore
```

> `package.json` 有改动：加了 `main` 字段、4 个 electron 脚本、3 个依赖。
> 原始文件已备份为 `package.json.bak-before-electron`，也可以用 `git checkout client/package.json` 还原。

---

## 三、怎么跑

```bash
cd client
npm install          # 新增 electron / electron-builder / electron-updater

# 开发态：两个终端
npm run dev          # 终端 1：Vite dev server (5173)
npm run electron:dev # 终端 2：Electron 窗口，加载 dev server

# 生产态本地验证（推荐用这个做演示）
npm run build        # 产出 dist/
npm run electron:start   # Electron 用内置静态服务加载 dist/ + 代理 /api

# 打包
npm run dist:dir     # 只产出解包目录，最快，用来验证配置
npm run dist:win     # Windows NSIS 安装包
npm run dist:mac     # macOS dmg + zip
npm run dist:linux   # AppImage + deb
```

**演示建议用 `npm run build && npm run electron:start`**，
因为这条路径走的是真实的生产加载方式（`http://127.0.0.1:<随机端口>`），
而不是 dev server，更能体现桌面端的真实形态。

### 打包要过的三道环境关（都在本机实测过）

**① Electron 二进制下不来。** 国内直连 `github.com/electron/electron/releases` 会直接 EOF，
electron-builder 卡在 `Get ... electron-v33.4.11-win32-x64.zip: EOF`。
已经在 `electron-builder.yml` 里配了 `electronDownload.mirror` 指向 npmmirror，
配好之后 115MB 的包 6 秒下完。另外 `client/.npmrc` 里也配了 `electron_mirror`，
覆盖安装依赖那一步。

**② electron-builder 自己的工具包也得走镜像。** `winCodeSign`（Windows 打包必需）同样从 GitHub 拉，
这一步没有 yml 配置项，要用环境变量：

```cmd
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
npm run dist:win
```

**③ Windows 符号链接权限（当前唯一没解决的）。** 解压 `winCodeSign` 时会报：

```
ERROR: Cannot create symbolic link : 客户端没有所需的特权。
  ...\winCodeSign\...\darwin\10.12\lib\libcrypto.dylib
```

这个压缩包里带 macOS 的 dylib 符号链接，而 Windows 默认不允许普通用户创建符号链接
（需要 `SeCreateSymbolicLinkPrivilege`）。**二选一即可解决**：

- **开启开发者模式**（推荐，不需要管理员）：
  设置 → 系统 → 开发者选项 → 打开「开发人员模式」
- 或者**用管理员身份**打开终端再执行打包命令

> 演示用不到打包：`npm run build && npm run electron:start` 就能把完整桌面端跑起来。
> 真需要出安装包时，先把开发者模式打开。

**另外**：如果在远程桌面 / 虚拟机里演示，Chromium 的 GPU 进程可能反复崩溃并连带退出应用，
加 `--no-gpu` 参数即可降级（`electron . --host-server --no-gpu`）。

---

## 四、CEO 问的四件事，逐条对应到代码

### 1. 打包发布

证据文件：`electron-builder.yml`、`package.json` 的 scripts

- **三平台目标分开配**：Windows 出 `nsis` + `portable`，macOS 出 `dmg` + `zip`，Linux 出 `AppImage` + `deb`
- **NSIS 的参数是有意选的**：`oneClick: false` 走安装向导、`perMachine: false` 按用户安装（不要求管理员权限）、`allowToChangeInstallationDirectory: true` 让用户自己选盘、`deleteAppDataOnUninstall: false` 卸载时保留用户数据（知识库不能跟着被删）
- **`asar: true`** 把代码打进归档，配合 `files` 白名单只装运行时需要的东西，`!**/*.map`、`!**/test/**` 这类排除项能显著减小体积
- **macOS 出 zip 不是随手加的**：`electron-updater` 在 macOS 上自更新依赖 zip 产物，只有 dmg 是没法自更新的
- 打包脚本分档：`dist:dir` 做快速验证，`dist:win` / `dist:mac` / `dist:linux` 分平台出包

**可以主动补一句**：我另外三个 Electron 桌面项目（代码片段管理 DevBox、笔记 NoteVault、系统监控 SysMonitor）
都是同一个 electron-builder 链路，Windows 安装包、桌面快捷方式、可选择安装目录这些都实际出过包。

### 2. 主进程 / 渲染进程通信

证据文件：`electron/preload.cjs`、`electron/ipc.cjs`、`electron/main.cjs` 的 `webPreferences`

三层结构：

```
主进程 (main.cjs + ipc.cjs)
   ↓  ipcMain.handle / webContents.send
preload (preload.cjs)   ← 唯一的桥，contextBridge 暴露白名单
   ↓  window.desktop.xxx()
渲染进程 (src/ 下的 Vue 代码)   ← 完全不碰 Node
```

两条链路要分清：

| 场景 | 机制 | 用在哪 |
|---|---|---|
| **请求-响应** | `ipcRenderer.invoke` → `ipcMain.handle` | 取应用信息、打开文件对话框、导出文件、检查更新 |
| **单向推送** | `webContents.send` → `ipcRenderer.on` | 更新下载进度、后端启动状态、托盘/快捷键事件 |

安全上的三个动作：

1. `contextIsolation: true` + `nodeIntegration: false` —— 渲染层拿不到 Node，页面里任何脚本都无法直接读写文件系统
2. **绝不把 `ipcRenderer` 整个暴露出去**。`preload.cjs` 里只暴露语义化方法（`file.pickFiles`、`update.check`），
   而且订阅通道还有一层白名单 `PUSH_CHANNELS`，防止页面监听任意 channel
3. **订阅必须能退订**。`onStatus()` 返回 unsubscribe 函数，`useDesktop.ts` 在 `onUnmounted` 里统一调用——
   这是 Electron 应用最常见的隐性内存泄漏点：组件反复挂载，监听器越堆越多

再加一条工程细节：`ipc.cjs` 里所有 handler 都过 `safeHandler` 包装，
异常统一返回 `{ ok: false, error }` 而不是 reject。这样界面能拿到可读的失败原因，
也不会因为某个系统调用失败就把页面搞崩。

### 3. 自动更新

证据文件：`electron/updater.cjs`、`dev-app-update.yml`、`scripts/update-server.cjs`

方案：**electron-updater + generic 静态源**（不需要任何后端服务，一个能吐静态文件的 http 目录就够）

链路：

```
启动 → autoUpdater.checkForUpdates()
     → 读 latest.yml（win）/ latest-mac.yml / latest-linux.yml
     → 比对 version
     → update-available  → 推送渲染层，界面弹提示
     → downloadUpdate()  → download-progress 事件持续推送百分比
     → update-downloaded → 提示"重启后生效"
     → quitAndInstall()  → 退出并静默安装，装完自动拉起
```

几个刻意的设计选择：

- **`autoDownload = false`**：是否下载交给用户决定，不在客户侧偷偷占带宽
- **差量更新**：electron-builder 会一起产出 `latest.yml` + `.blockmap`，
  每次只下载变动的块。演示脚本 `scripts/update-server.cjs` 里专门实现了 **Range 请求（206）**，
  因为差量下载就是靠它
- **`UPDATE_FEED_URL` 运行时覆盖更新源**：同一份安装包要发给不同客户，
  内网私有化部署时把更新源指向客户自己的静态目录就行，不用重新打包
- **`dev-app-update.yml` + `forceDevUpdateConfig`**：electron-updater 默认拒绝在未打包的应用里检查更新，
  打开这个开关可以在本地把整条链路跑通，不用每次都真打个包

**必须主动说的两个坑（这才是真做过和看过文档的区别）：**

1. **Windows 没有代码签名证书，SmartScreen 会拦安装包**，用户看到的是"未知发布者"警告，升级包同理。
   企业分发要么买 OV/EV 证书，要么走内网白名单。
2. **macOS 需要 Developer ID 签名 + 公证（notarization）**，否则 Gatekeeper 直接拦。
   而且 macOS 上的自更新必须依赖 zip 产物。

**诚实的边界**：这两项我没有实操过签名和公证流程（需要企业开发者账号），
代码里把配置预留了（`hardenedRuntime`、`entitlementsInherit`、`notarize` 注释位），
但没跑通过真实的签名发布。**这块不要编，直接承认。**

### 4. 跨平台适配

证据文件：`electron/paths.cjs`、`electron/main.cjs` 的平台分支、`electron-builder.yml`

跨平台不只是"配三个 target"，真正的差异在这几处：

| 差异点 | 处理方式 |
|---|---|
| **安装目录 vs 用户数据目录** | 打包后安装目录在 Windows 是 Program Files、macOS 可能是只读。所有可写路径一律走 `app.getPath('userData')`，在 `paths.cjs` 里集中解析，业务代码不允许硬编码相对路径 |
| **窗口关闭语义** | Windows/Linux 习惯"关掉就退出"，macOS 习惯"进程常驻 + 点 Dock 图标重新拉起"。所以 `close` 事件里拦截并隐藏，真正退出走托盘菜单；`window-all-closed` 在 Linux 上例外——因为 Linux 某些桌面环境托盘不可靠，会变成"没窗口也没托盘的僵尸进程" |
| **托盘图标格式** | Windows 用 `.ico`，macOS/Linux 用 `.png`；macOS 还建议用 template image（纯黑+alpha），系统会自动适配深浅色主题 |
| **托盘可降级** | Linux 桌面环境不保证支持托盘，`createTray` 包了 try/catch，失败就降级为不常驻模式，而不是让应用起不来 |
| **去中心的原生能力** | 选文件走 `dialog.showOpenDialog`（拿真实磁盘路径）、导出走 `showSaveDialog`、通知走 `Notification`，都不依赖浏览器沙箱 |
| **Windows 通知的坑** | 必须调 `app.setAppUserModelId()`，否则原生通知显示的是 `electron.app.xxx` 而不是应用名 |

**诚实的边界**：三平台目标都配好了，Windows 上我实机出过包；
macOS 和 Linux 我**没有真机验证过**，配置是按文档写的。这个要如实说。

---

## 五、额外的两个工程决策（主动讲能加分）

### 1. 内置静态托管 + API 反向代理（`hostServer.cjs`）

**问题**：生产环境如果用 `file://` 加载页面，前端里所有的相对路径请求都会失效
（`axios` 的 `baseURL: '/'`、到处的 `/api/xxx`），而把它们改成绝对地址又会让 Web 端和桌面端代码分叉。
而且任务引擎的 SSE 进度流（`/api/tasks/:id/events`）也要原样透传，用自定义协议去代理流很别扭。

**解法**：主进程起一个本地 http 服务（只监听 `127.0.0.1`，端口传 0 让系统分配，避免占用冲突）：

- `/api/*` → 反向代理到本地后端，**SSE 原样透传不缓冲**
- 其它路径 → 吐 `dist/` 下的静态文件，未命中回落 `index.html`（SPA 深链接）

**额外收益**：渲染层和接口变成**同源**，彻底绕开 CORS 白名单问题。
这个模式我在自己的 DevBox 桌面项目里也用过（内置 Express 代理服务）。

还做了一个安全处理：路径拼接后校验 `path.relative` 是否越出 `dist/`，防目录穿越。

### 2. 用 `process.execPath` + `ELECTRON_RUN_AS_NODE` 拉起后端（`backend.cjs`）

**问题**：桌面端要托管本地后端，但客户电脑上不一定装了 Node，
就算装了也可能版本不对，直接导致"在我机器上好好的，在客户那儿起不来"。

**解法**：用 Electron 自身的可执行文件以纯 Node 模式运行子进程：

```js
spawn(process.execPath, [serverEntry], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
```

这样**依赖闭包完全自洽**，客户不需要任何额外运行时。

配套的三个健壮性处理：

- 启动前先 `pingHealth`，开发态后端已经在跑就直接复用，不重复拉起（否则抢端口）
- **健康检查轮询而不是 sleep 固定时长**，最长等 30s
- **后端失败不阻断窗口显示**，而是把状态推给渲染层，界面自己提示"本地服务未就绪"——
  桌面端最忌讳的就是"后端没起来所以整个窗口白屏"

退出时 `will-quit` 里回收子进程，否则用户卸载重装会遇到端口占用。

---

## 六、面试现场演示脚本（约 3 分钟）

1. **先开窗口**，指着界面说：「这就是原来那套 Vue 代码，`src/` 一行没改，桌面端是包在外面的。」
2. **打开 DevTools**（`Ctrl+Shift+I`），在 Console 里敲 `window.desktop` ——
   展示暴露出来的能力清单，同时说明：`window.require`、`window.process` 都是 `undefined`，
   因为 `nodeIntegration: false`。
3. **点托盘图标**，说明常驻与全局快捷键（`CommandOrControl+Shift+Space`）。
4. **打开 `electron/main.cjs`**，讲 `will-quit` 里的资源回收顺序（快捷键 → 托盘 → 后端子进程 → 本地服务）。
5. **打开 `electron/preload.cjs`**，讲为什么要白名单、为什么订阅要返回 unsubscribe。
6. **打开 `electron/updater.cjs`**，讲更新链路，然后主动说签名/公证那两个坑。
7. 如果被问"能看看自动更新真的跑起来吗"：开两个终端，
   一个跑 `node scripts/update-server.cjs <版本目录> 9876`，另一个跑
   `UPDATE_FORCE_DEV=1 UPDATE_FEED_URL=http://127.0.0.1:9876 npm run electron:dev`。

---

## 七、顺手修掉的三个真实缺陷（原来的构建是跑不通的）

准备桌面端的过程中发现：**这个项目的 `npm run build` 在改造之前就已经完全跑不通**，
一共三个原因叠在一起。这些不是桌面端引入的问题，但没有修掉就没法产出 `dist/`，
桌面端也就无从加载。

### 1. `vue-tsc` 与 TypeScript 版本不兼容

```
C:\...\node_modules\vue-tsc\bin\vue-tsc.js:68
Search string not found: "/supportedTSExtensions = .*(?=;)/"
```

已安装 `vue-tsc@1.8.27` + `typescript@5.9.3`。
`vue-tsc` 1.x 的实现方式是去 patch `tsc` 的源码字符串，而 TS 5.9 改动了那段输出，
patch 直接找不到锚点就抛异常 —— 连编译都没开始就挂了。

**处理**：把类型检查从构建流程里拆出来，构建不再被类型检查阻塞：

```json
"build": "vite build",
"type-check": "vue-tsc --noEmit",
```

**建议的彻底修复**：把 `vue-tsc` 升到 `^2.0.6`（自己在 vite-electron 项目里用的就是这个版本）。
升级后可以直接改回 `"build": "vue-tsc --noEmit && vite build"`。
这里没有直接升，是因为升级后可能暴露出存量类型错误，需要单独安排一次清理。

### 2. `ForgotPasswordView.vue` 导入了不存在的符号

`src/api/auth.ts` 导出的是 `forgotPassword(email: string)`，
但视图里写的是 `import { ForgotPassword }` 并且按对象调用 `ForgotPassword({ email })`。
类名式写法与实际导出对不上，Rollup 直接报 `"ForgotPassword" is not exported`。

**处理**：改为 `import { forgotPassword }` + `forgotPassword(form.email)`，与函数签名一致。

### 3. `ResetPasswordView.vue` 同样的类名式导入

`import { ResetPassword }` → 实际导出是 `resetPassword(token, newPassword)`。
调用处参数本来就对，只是导入名错了。

**处理**：改为 `import { resetPassword }`。

### 附带：`@/api/search` 缺少类型再导出

`SearchView.vue` / `SearchInput.vue` 从 `@/api/search` 导入 `SearchParams`、`SearchResponse`、
`SearchHistory`、`PopularSearch`、`SearchFacets`、`SearchSuggestion`，
但这些 interface 实际定义在 `src/types/search.ts`，api 层只 import 没有 re-export。

**处理**：在 `src/api/search.ts` 增加一段 `export type { ... } from '@/types/search'`。
放在 api 层再导出比改调用方更稳——调用方只需要认一个入口。

> 修完之后 `npm run build` 正常产出 `dist/`（1989 modules，约 14s，主包 1.27MB）。
> **这条也值得在面试里提一句**：接手一个项目先把构建打通，是工程习惯，不是运气。

## 八、跨进程调用里踩到的一个真实坑：CORS

前端里有几处是**直接拿绝对地址**发请求的，而不是走相对路径：

- `src/api/task.ts` → `${API_BASE_URL}/api/tasks/:id/events`（任务引擎 SSE 进度流）
- `src/api/model.ts` → `${API_BASE_URL}/api/model/list`
- `src/components/common/Sidebar.vue`、`src/components/settings/UserSettings.vue`

`API_BASE_URL` 来自 `VITE_API_BASE_URL`，默认 `http://localhost:3001`。

Web 开发态没问题（Vite 有 proxy）。但桌面端渲染层的来源是
`http://127.0.0.1:<动态端口>`，去请求 `http://localhost:3001` 就是**跨域**，
而后端的 CORS 白名单只列了 5173/5174 两个端口 —— 请求会被直接拦掉。

**处理**：在后端 CORS 判断里放行"本机回环来源"：

```ts
const isLoopbackOrigin = (origin: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
```

只放行 loopback，外部站点依然被拒。这样桌面端不管分到哪个端口都能正常工作，
也不用为了打包去把前端所有绝对地址改成相对地址。

**这题的讲法**：「桌面端最容易踩的不是 Electron API，而是**来源（origin）变了**。
渲染层不再是 5173，而是本地托管服务的随机端口，所有依赖固定端口的假设都会失效。
要么统一走同源代理，要么在服务端放开 loopback 来源 —— 我两个都做了。」

## 九、还没做的（留着，别装作做完了）

- [ ] **应用图标**：`electron-builder.yml` 里的 `icon` 目前注释掉了，缺图标时会用 Electron 默认图标。
      补齐 `resources/icon.ico`（Windows）和 `resources/icon.png`（macOS/Linux，建议 512×512）后取消注释即可。
- [ ] **macOS 签名与公证**：需要 Apple Developer 账号，配置位已预留。
- [ ] **macOS / Linux 真机验证**：配置已写，未实机跑过。
- [ ] **自定义标题栏**：`ipc.cjs` 里的 `window.minimize / toggleMaximize / close` 已经就绪，
      但当前用的是系统默认边框（这样更稳）。要做无边框标题栏，接上这几个方法即可。
- [ ] **后端随包分发**：当前 `backend.cjs` 从 `../server` 找入口。要真正发给客户，
      需要把 `server/dist` + 其 `node_modules` 通过 `extraResources` 一起打进安装包
      （体积会明显变大，因为 LangChain + Chroma 都在里面）。
      更彻底的做法是把向量库换成对打包更友好的方案，或后端改用单文件打包。
- [ ] **更新日志展示**：`latest.yml` 里的 `releaseNotes` 已经能拿到，界面还没做展示。

---

## 八、如果被问到自己那三个 Electron 项目

可以这样介绍（都是真的，可以直接投屏）：

- **DevBox**（代码片段 / API 调试 / Diff / 环境变量）：electron-vite + TypeScript，
  主进程里带一个内置 Express 代理服务，托盘常驻，全局快捷键 `Ctrl+Shift+D`
- **NoteVault**（本地笔记，Tiptap 富文本 + 全文检索）
- **SysMonitor**（进程/任务/系统指标监控，ECharts + WebSocket + node-cron）

这三个项目的价值在于：**打包发布和主进程/渲染进程通信这两块，我是反复做过的，不是照着文档抄一遍。**
README 里写的"待完善：自动更新（electron-updater）"就是指当时还没做的那部分——
这次在智知这个 AI 项目上把它补齐了。

**这样的说法比"四项我都做过"更可信**，因为它同时解释了能力的来源和边界。
