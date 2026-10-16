# ===== zhizhi 定制 Jenkins：开箱即用的一体化构建机 =====
#
# 在官方 jenkins/jenkins:lts 基础上补齐三件事：
#   1. docker CLI + compose v2 插件 —— 挂载宿主机 docker.sock 后，流水线里的
#      docker build / docker compose 直接作用于 Docker Desktop 的守护进程；
#   2. Node 20 —— Jenkinsfile 的质量门禁（tsc / vitest / vite build）在 agent 上直接跑；
#   3. 预装 git + Pipeline 插件（走清华 update center，容器内可达）。
#
# 网络说明：Docker Hub / GitHub 直连不通的环境下，所有外部依赖都走国内镜像源
# （daocloud 拉 docker:cli、npmmirror 拉 Node/Electron、清华拉 Jenkins 插件）。

# Docker Hub 直连不通的环境用 daocloud 代理拉基础镜像
FROM docker.m.daocloud.io/jenkins/jenkins:lts

USER root

# ---- docker CLI + compose 插件（从 daocloud 代理的官方 docker:cli 镜像里取现成二进制） ----
COPY --from=docker.m.daocloud.io/library/docker:cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker.m.daocloud.io/library/docker:cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins

# ---- Node 20（直接从 daocloud 代理的官方 node 镜像复制二进制，免下载） ----
COPY --from=docker.m.daocloud.io/library/node:20-bookworm /usr/local/bin/node /usr/local/bin/node
COPY --from=docker.m.daocloud.io/library/node:20-bookworm /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node -v && npm -v

# client 依赖里的 electron 会在 npm ci 时下载二进制，容器内直连 GitHub 不通，走镜像
ENV ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# 挂载进来的仓库目录属主是 root，容器内 git 操作会触发 dubious ownership 检查
ENV GIT_CONFIG_COUNT=1 \
    GIT_CONFIG_KEY_0=safe.directory \
    GIT_CONFIG_VALUE_0=*

# ---- Jenkins 插件（git + Pipeline 套件） ----
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
# 官方 update center（CDN）；国内镜像站已陆续停更（清华/腾讯均 404）
RUN jenkins-plugin-cli -f /usr/share/jenkins/ref/plugins.txt

# 挂载 docker.sock 后以 root 运行，避免 sock 权限问题（本地部署场景，接受此权衡）
USER root
