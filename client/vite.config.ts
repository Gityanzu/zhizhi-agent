import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5678,
    proxy: {
      // 流式接口：SSE 配置
      '/api/chat/stream': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        proxyTimeout: 0,
        timeout: 0,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept', 'text/event-stream');
          });
        },
      },
      // 任务引擎 SSE 事件流（长连接：关闭代理超时与缓冲，避免进度流被缓冲/中断）
      '/api/tasks': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        proxyTimeout: 0,
        timeout: 0,
        rewrite: (path) => path,
      },
      // 所有 /api 开头的请求都代理到后端
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
})
