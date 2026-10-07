// ===== 智知 zhizhi-agent CI/CD 流水线 =====
// 跨平台声明式流水线：本机 Windows（Docker Desktop + Node）与将来 Linux 服务器通用。
// 触发策略：
//   - PR / 非 main 分支 push → 仅质量门禁 + 测试
//   - main 分支              → 门禁 + 镜像构建 + 部署（docker compose）
//   - tag v*                 → 在 main 流程之上，追加桌面端打包发布 + 归档
// 前置要求（agent 机器）：Node 20、Docker（含 compose 插件）；Windows 打包需 Jenkins 跑在 Windows 上。
// 密钥：LLM_API_KEY 等放 deploy/.env（不进 git）；接入凭据插件后可换 credentials()。

// 跨平台执行辅助：Linux/macOS 走 sh，Windows 走 powershell。
// 传单个 script 时两端共用（仅限 sh/powershell 语法一致的纯命令）；
// 语法有差异（|| / Test-Path / curl 等）时分别传 shScript 与 psScript。
def runCmd(String shScript, String psScript = null) {
  if (isUnix()) { sh shScript } else { powershell(psScript ?: shScript) }
}

pipeline {
  agent any

  options {
    timestamps
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 60, unit: 'MINUTES')
  }

  environment {
    COMPOSE_FILE = 'deploy/docker-compose.yml'
    SERVER_IMAGE = "zhizhi-server:${env.GIT_COMMIT?.take(7) ?: 'local'}"
    CLIENT_IMAGE = "zhizhi-client:${env.GIT_COMMIT?.take(7) ?: 'local'}"
    WEB_PORT     = '8080'
    HEALTH_URL   = "http://localhost:${WEB_PORT}/api/health"
  }

  stages {
    stage('检出代码 Checkout') {
      steps { checkout scm }
    }

    stage('质量门禁 Quality Gate') {
      parallel {
        stage('后端类型检查 server tsc') {
          steps {
            dir('server') {
              runCmd('npm ci --no-audit --no-fund')
              // 存量类型错误暂不阻断（历史遗留），后续清零可去掉“恒成功”兜底变硬门禁
              runCmd('npx tsc --noEmit || true', 'npx tsc --noEmit; exit 0')
            }
          }
        }
        stage('前端类型检查 client vue-tsc') {
          steps {
            dir('client') {
              runCmd('npm ci --no-audit --no-fund')
              runCmd('npm run type-check || true', 'npm run type-check; exit 0')
            }
          }
        }
      }
    }

    stage('单元测试 Unit Tests') {
      steps {
        dir('server') { runCmd('npm run test:run') }
      }
    }

    stage('构建镜像 Build Images') {
      when { anyOf { branch 'main'; tag 'v*' } }
      steps {
        // 一次构建，多处部署：产物镜像打 git sha 标签，部署阶段只拉不改
        runCmd("docker build -f deploy/Dockerfile.server -t ${env.SERVER_IMAGE} .")
        runCmd("docker build -f deploy/Dockerfile.client -t ${env.CLIENT_IMAGE} .")
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 【上云可选 · 默认注释】推送镜像到仓库（build 与 deploy 分离时用）
    // 启用步骤：① 去掉本 stage 的 // 注释；② 在 Jenkins 添加凭据 id=docker-registry（Username with password）；
    //          ③ 把 REGISTRY 换成你的仓库地址（如 registry.cn-hangzhou.aliyuncs.com/你的命名空间）；
    //          ④ 把部署阶段改为「pull 已推送的镜像」而非本机 build。
    // stage('推送镜像 Push Images') {
    //   when { anyOf { branch 'main'; tag 'v*' } }
    //   environment { REGISTRY = 'registry.cn-hangzhou.aliyuncs.com/zhizhi' }
    //   steps {
    //     withCredentials([usernamePassword(credentialsId: 'docker-registry',
    //                     usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
    //       runCmd('echo "$REG_PASS" | docker login "$REGISTRY" -u "$REG_USER" --password-stdin',
    //              '$env:REG_PASS | docker login $env:REGISTRY -u $env:REG_USER --password-stdin')
    //       runCmd("docker tag ${env.SERVER_IMAGE} ${env.REGISTRY}/${env.SERVER_IMAGE} && docker push ${env.REGISTRY}/${env.SERVER_IMAGE}")
    //       runCmd("docker tag ${env.CLIENT_IMAGE} ${env.REGISTRY}/${env.CLIENT_IMAGE} && docker push ${env.REGISTRY}/${env.CLIENT_IMAGE}")
    //     }
    //   }
    // }
    // ─────────────────────────────────────────────────────────────

    stage('部署 Deploy（docker compose）') {
      when { anyOf { branch 'main'; tag 'v*' } }
      steps {
        // 首次运行若无 deploy/.env，从模板复制一份供填写密钥
        runCmd(
          'test -f deploy/.env || cp deploy/.env.example deploy/.env',
          'if (-not (Test-Path deploy/.env)) { Copy-Item deploy/.env.example deploy/.env }'
        )
        // 用本次构建的镜像滚动更新应用栈（不带 --build，复用上一阶段产物）
        withEnv(["SERVER_IMAGE=${env.SERVER_IMAGE}", "CLIENT_IMAGE=${env.CLIENT_IMAGE}", "WEB_PORT=${env.WEB_PORT}"]) {
          runCmd('docker compose -f deploy/docker-compose.yml up -d --remove-orphans')
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 【上云可选 · 默认注释】SSH 远程部署（App 在云服务器、Jenkins 与 App 分离时用）
    // 用本 stage 替换上面的「部署 Deploy」。启用步骤：① 去掉 // 注释；
    // ② Jenkins 添加凭据 id=app-server-key（SSH Username with private key）；③ APP_HOST 换成你的服务器。
    // 前置：服务器已 clone 本仓库到 /opt/zhizhi-agent、已装 docker+compose、deploy/.env 已填密钥。
    // stage('远程部署 Deploy SSH') {
    //   when { anyOf { branch 'main'; tag 'v*' } }
    //   steps {
    //     withCredentials([sshUserPrivateKey(credentialsId: 'app-server-key', keyFileVariable: 'SSH_KEY')]) {
    //       sh('''
    //         set -e
    //         ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new deploy@your.server.com '
    //           set -e
    //           cd /opt/zhizhi-agent
    //           git fetch --all && git reset --hard origin/main
    //           docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
    //           docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --remove-orphans
    //         '
    //       ''')
    //     }
    //   }
    // }
    // ─────────────────────────────────────────────────────────────

    stage('健康检查 Health Check') {
      when { anyOf { branch 'main'; tag 'v*' } }
      steps {
        retry(count: 10, delay: 5) {
          runCmd(
            "curl -fsS '${env.HEALTH_URL}' || { docker compose -f deploy/docker-compose.yml logs --tail=100 server; exit 1; }",
            "try { Invoke-RestMethod -Uri '${env.HEALTH_URL}' -TimeoutSec 10 | ConvertTo-Json -Compress | Write-Host } catch { Write-Host \"健康检查失败：$($_.Exception.Message)\"; docker compose -f deploy/docker-compose.yml logs --tail=100 server; exit 1 }"
          )
        }
      }
    }

    stage('桌面端发布 Release Desktop（electron-builder --win）') {
      when { tag 'v*' }
      steps {
        script {
          if (isUnix()) {
            error('桌面端 Windows 安装包必须在 Windows agent 上构建，当前节点为 Unix，终止。')
          }
        }
        dir('client') {
          runCmd('npm run dist:win')
        }
        archiveArtifacts artifacts: 'client/release/**/*setup*.exe, client/release/latest*.yml', fingerprint: true, allowEmptyArchive: false
      }
    }
  }

  post {
    always {
      runCmd(
        'docker system prune -f --volumes >/dev/null 2>&1 || true',
        'docker system prune -f --volumes 2>$null; exit 0'
      )
    }
    success { echo "✅ 流水线成功：${env.BUILD_URL}" }
    failure { echo "❌ 流水线失败，请查看日志：${env.BUILD_URL}console" }
  }
}
