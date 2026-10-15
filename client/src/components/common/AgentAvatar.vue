<script setup lang="ts">
/**
 * AgentAvatar — 助手品牌头像
 *
 * 内联 SVG 绘制的机器人头像（渐变底 + 白色圆脸 + 双眼 + 天线），
 * 零外部图片依赖；size 可调，多实例渐变 id 自动去重。
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ size?: number }>(), { size: 26 })

// 同页多实例时避免 <defs> 渐变 id 冲突
const uid = Math.random().toString(36).slice(2, 8)
const gid = computed(() => `agent-avatar-g-${uid}`)
</script>

<template>
  <span class="agent-avatar" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :width="size" :height="size" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#6366f1" />
          <stop offset="1" stop-color="#a855f7" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" :fill="`url(#${gid})`" />
      <!-- 天线 -->
      <circle cx="24" cy="11.5" r="2.4" fill="#fff" opacity="0.95" />
      <rect x="23" y="13.5" width="2" height="3.6" rx="1" fill="#fff" opacity="0.95" />
      <!-- 头 -->
      <rect x="13" y="17" width="22" height="16.5" rx="6.5" fill="#ffffff" opacity="0.96" />
      <!-- 耳 -->
      <rect x="10.5" y="22.5" width="2.6" height="5.5" rx="1.3" fill="#fff" opacity="0.8" />
      <rect x="34.9" y="22.5" width="2.6" height="5.5" rx="1.3" fill="#fff" opacity="0.8" />
      <!-- 眼睛 -->
      <circle cx="19.6" cy="24.6" r="2.2" fill="#6d5ce7" />
      <circle cx="28.4" cy="24.6" r="2.2" fill="#6d5ce7" />
      <!-- 嘴 -->
      <rect x="20.6" y="28.4" width="6.8" height="1.7" rx="0.85" fill="#c7d2fe" />
    </svg>
  </span>
</template>

<style scoped>
.agent-avatar {
  display: inline-flex;
  flex-shrink: 0;
}
.agent-avatar svg {
  display: block;
}
</style>
