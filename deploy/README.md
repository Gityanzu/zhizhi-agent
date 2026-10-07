# 智知 zhizhi-agent — CI/CD 与部署运行手册

本目录提供一套**本机即可跑通、将来可平移到云服务器**的构建 / 部署 / 发布方案：

```
Jenkinsfile              仓库根，声明式跨平台流水线（门禁→测试→构建镜像→部署→健康检查→桌面发布）
deploy/
├─ Dockerfile.server     后端多阶段镜像（tsc 编译 → 仅产物 + 生产依赖运行）
├─ Dockerfile.client     前端 Web 镜像（vite build → nginx 托管，/api 反代含 SSE）
├─ nginx.conf            SPA 静态托管 + /api 反向代理（流式接口关缓冲）
├─ docker-compose.yml    应用栈：postgres + redis + server + client
└─ .env.example          环境变量模板（复制为 deploy/.env 后填密钥）
```

> 桌面端（Electron）随包在本地跑后端，"发布"≈ 打安装包 + 放自动更新源；Web 栈则用 compose 部署。两条线互不干扰。

---

## 0. 前置要求

流水线与 compose 都依赖 **Docker** 与 **Node 20**。当前这台 Windows 机器**还没装 Docker**，先补齐：

| 工具 | 用途 | 安装 |
|---|---|---|
| **Docker Desktop**（含 compose 插件、WSL2 后端） | 构建镜像 / 跑应用栈 / 跑 Jenkins 容器 | https://www.docker.com/products/docker-desktop/ |
| **Node 20 + npm** | 流水线内的类型检查 / 测试 / 打包 | https://nodejs.org/ |
| **Git** | 源码检出、镜像 tag 用 git sha | 已装 |

安装 Docker Desktop 后验证（PowerShell）：

```powershell
docker --version
docker compose version
```

> WSL2 未启用会报错，按 Docker Desktop 提示启用后重启即可。

---

## 1. 纯 Docker 部署（不接 Jenkins，先把应用跑起来验证）

适合"我还没配 Jenkins，想先确认这套镜像/compose 能不能起来"。

```powershell
# 仓库根目录执行
cd deploy
Copy-Item .env.example .env        # 然后编辑 .env，至少填 LLM_API_KEY
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

> 注意 compose 里 build.context 是 `..`（仓库根），所以**在仓库根**执行最省心：
> `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build`

- 打开 Web：http://localhost:8080
- 健康检查：http://localhost:8080/api/health
- 看日志：`docker compose -f deploy/docker-compose.yml logs -f server`
- 停栈：`docker compose -f deploy/docker-compose.yml down`（加 `-v` 连数据卷一起删，慎用）

数据持久化在命名卷 `pg_data`（数据库）、`redis_data`（缓存）、`app_data`（上传/向量库）里，`down` 不带 `-v` 不会丢数据。

---

## 2. 本机跑通 Jenkins 流水线

Jenkins 本身需要一台常驻机器 —— 本机就用 Docker Desktop 跑一个 Jenkins 容器充当它，将来把这个容器原样搬到云服务器，**Jenkinsfile 不用改**，只换部署目标。

### 2.1 启动 Jenkins 容器

```powershell
docker volume create jenkins_data
docker run -d --name jenkins `
  -p 8081:8081 -p 50000:50000 `
  -v jenkins_data:/var/jenkins_home `
  -v //var/run/docker.sock:/var/run/docker.sock `
  jenkins/jenkins:lts
```

- 初始管理员密码：`docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword`
- 打开 http://localhost:8081，装推荐插件，建管理员账号。

> ⚠ 上面的 docker.sock 挂载用于 **Linux/WSL** 场景（Jenkins 容器内可调用宿主机 Docker）。**Docker Desktop on Windows** 下更稳妥的做法是：给 Jenkins 容器安装 Docker CLI/Compose，或直接把流水线跑在 Jenkins 的 built-in agent 上用宿主 Docker —— 由于本机就是 Windows，最简方式是让 Jenkins 以 **Windows 容器/或直接在 Windows 上原生安装 Jenkins**，从而能直接调用你已装的 Docker Desktop。练手期推荐：**原生装 Jenkins（`java -jar jenkins.war`）跑在 Windows 上**，这样 `docker`、`npm` 都是宿主命令，零挂载坑。

### 2.2 原生 Jenkins（练手最省事，推荐）

```powershell
# 需先装 JDK 17+
java -jar jenkins.war --httpPort=8081
```

打开 http://localhost:8081 → 在 Jenkins 里安装插件：**Pipeline**、**Git**（通常自带）。

### 2.3 建流水线任务

1. New Item → **Pipeline**，命名 `zhizhi-agent`。
2. Pipeline → Definition = **Pipeline script from SCM** → Git → 填你的仓库 URL 与凭据 → Script Path = `Jenkinsfile`。
   - 练手期若仓库只在本地：先 `git remote add origin <你的GitLab/GitHub地址>` 推上去；或临时用 "Pipeline script" 直接粘贴 Jenkinsfile 内容，agent 选 Built-In。
3. 触发：配 **Poll SCM**（如 `H/5 * * * *`）或装 Git webhook 插件推送触发。
4. Save → **Build Now**，看 Stage View。

### 2.4 流水线阶段与触发对应

| 阶段 | PR / 非 main | main | tag `v*` |
|---|---|---|---|
| 质量门禁（server tsc + client vue-tsc） | ✅ | ✅ | ✅ |
| 单元测试（server `npm run test:run`） | ✅ | ✅ | ✅ |
| 构建镜像（server + client，打 git sha 标签） | — | ✅ | ✅ |
| 部署（docker compose up -d） | — | ✅ | ✅ |
| 健康检查（轮询 /api/health） | — | ✅ | ✅ |
| 桌面端打包发布（`dist:win` + 归档 exe/latest.yml） | — | — | ✅ |

> 门禁里的类型检查当前是**软门禁**（`|| true` / `; exit 0`）——存量历史错误不会卡流水线。等清零后，把 [Jenkinsfile](../Jenkinsfile) 里 `runCmd('npx tsc --noEmit || true', ...)` 的兜底去掉即可变硬门禁。

---

## 3. 桌面端发布（tag `v*` 触发）

需 Jenkins 跑在 **Windows** 上（Electron 打 Windows 安装包）：

- 产物在 `client/release/`：`*Setup*.exe`、`latest.yml`。
- 流水线用 `archiveArtifacts` 归档，可在构建页下载。
- 接 `electron-updater` 自动更新：把 `latest.yml` + exe 发布到你的更新源（对象存储 / GitHub Releases / 服务器静态目录）。发布目标在 [Jenkinsfile](../Jenkinsfile) 的 `桌面端发布` 阶段之后按需追加一步上传（如 `aws s3 cp` / `rclone copy` / scp）。

发版操作：

```powershell
git tag v1.0.0
git push origin v1.0.0        # 触发 tag 流水线
```

---

## 4. 迁移到云服务器

本机这套 100% 平移，**只改三处**：

1. **Jenkins**：把 Jenkins 容器/进程部署到云服务器（或公司现成 Jenkins 加一个 agent 节点，标签区分 Linux）。
2. **部署目标**：[Jenkinsfile](../Jenkinsfile) `部署 Deploy` 阶段目前对本机 `docker compose up`。上云后二选一：
   - 云服务器同样跑 compose（Jenkins 与 App 同机）→ 不变；
   - Jenkins 与 App 分离 → 把该阶段改成"推镜像到仓库 + SSH 到服务器 `docker compose pull && up -d"`"，凭据用 Jenkins `credentials()` + `sshagent`/`withSSH`。
3. **镜像仓库**：`SERVER_IMAGE`/`CLIENT_IMAGE` 由本地 `zhizhi-server:sha` 换成 `registry.example.com/zhizhi-server:sha`，加 `docker login` + `docker push`（在 `构建镜像` 阶段后）。

服务器上跑应用栈与本机一致：

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

反向代理（域名/TLS）在生产用一层 Nginx/Caddy 挡在 `client:80` 前；`deploy/nginx.conf` 已是站点配置，可直接复用。

---

## 5. 日志与运行监控

任职要求里的"日志与运行监控"落地建议（按演进顺序，先简后繁）：

1. **容器日志**：`docker compose logs -f server`；生产用 json-file 驱动限制大小，在 compose 的 service 加：
   ```yaml
   logging:
     driver: json-file
     options: { max-size: "10m", max-file: "3" }
   ```
2. **健康探活**：compose 已给 `server` 配 healthcheck（`fetch /api/health`）；`client`/Jenkins 可 `depends_on: condition: service_healthy`。
3. **指标 + 看板**（进阶）：加 **Prometheus + Grafana** 容器，后端暴露 `/metrics`（`prom-client`），抓取 node/容器/应用指标；告警走 Grafana Alerting 或 Alertmanager。
4. **集中日志**（多机时）：**Loki + Promtail**（轻量）或 ELK，把各容器 stdout 汇聚检索。

先做 1+2 就能满足"能看日志、能探活"，3+4 在有多台机器/正式运营时再上。

---

## 6. 常见问题

- **`docker` 不是可识别的命令**：Docker Desktop 未安装或未启动，见第 0 节。
- **compose 构建找不到 `server/`、`client/`**：build context 是仓库根，务必在**仓库根**执行 `-f deploy/docker-compose.yml`。
- **前端起来了但接口 502**：`client` 的 nginx 反代 `http://server:3001`，确认 `server` 容器 healthy、compose 网络默认打通。
- **SSE 流式对话卡住/不输出**：`nginx.conf` 已对 `/api/chat/stream` 关 `proxy_buffering`；若自建反代记得同样处理。
- **8080/8081 端口占用**：改 `WEB_PORT`（应用）或 Jenkins 启动 `--httpPort`。
- **Jenkins 容器内没有 docker 权限**：练手期改用原生 Jenkins（见 2.2），避免挂载与权限坑。
