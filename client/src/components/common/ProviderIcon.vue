<script setup lang="ts">
/**
 * ProviderIcon — 大模型厂商/模型的品牌图标
 *
 * 按模型名/厂商名关键词映射到品牌标识（标志性符号或字母徽章 + 品牌色），
 * 纯内联渲染、零网络依赖（桌面端离线也正常），不依赖各厂商商标 SVG 资产。
 *
 * 识别优先级：先匹配厂商（providerId/providerName），再匹配模型名关键词。
 * 未识别时回退为名称首字母 + 中性灰。
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** 模型名或厂商名/ID，如 "Deepseek-V4.1-Flash" / "deepseek" / "GLM-5.3" */
  name: string
  /** 额外的厂商提示（providerId / providerName），优先于 name 判定 */
  provider?: string
  size?: number
}>(), {
  provider: '',
  size: 16,
})

interface Brand {
  mark: string       // 展示符号：emoji 或短字母
  bg: string         // 徽章底色
  fg?: string        // 前景色（emoji 省略则继承自身彩色）
  fontSizeRatio?: number
}

// 关键词 → 品牌（顺序即优先级，先长后短避免误匹配）
const BRANDS: Array<{ keys: string[]; brand: Brand }> = [
  { keys: ['deepseek', 'deep-seek'], brand: { mark: '🐳', bg: '#EEF2FF' } },
  { keys: ['glm', 'zhipu', 'chatglm', '智谱'], brand: { mark: 'Z', bg: '#3859FF', fg: '#fff', fontSizeRatio: 0.6 } },
  { keys: ['qwen', 'qwen3', 'tongyi', '通义', 'bailian', '百炼', 'dashscope'], brand: { mark: '通', bg: '#6236FF', fg: '#fff', fontSizeRatio: 0.6 } },
  { keys: ['kimi', 'moonshot', '月之暗面'], brand: { mark: 'K', bg: '#16191E', fg: '#fff', fontSizeRatio: 0.62 } },
  { keys: ['claude', 'anthropic'], brand: { mark: '✳', bg: '#D97757', fg: '#fff', fontSizeRatio: 0.7 } },
  { keys: ['openai', 'gpt', 'o1', 'o3', 'chatgpt'], brand: { mark: 'G', bg: '#10A37F', fg: '#fff', fontSizeRatio: 0.62 } },
  { keys: ['gemini', 'google'], brand: { mark: '✦', bg: '#1C69FF', fg: '#fff', fontSizeRatio: 0.7 } },
  { keys: ['ollama', 'llama'], brand: { mark: '🦙', bg: '#F3F4F6' } },
  { keys: ['doubao', '豆包', '火山'], brand: { mark: '豆', bg: '#1456FF', fg: '#fff', fontSizeRatio: 0.6 } },
  { keys: ['minimax', '海螺'], brand: { mark: 'M', bg: '#F23F5D', fg: '#fff', fontSizeRatio: 0.62 } },
  { keys: ['step', '阶跃'], brand: { mark: 'S', bg: '#0533F5', fg: '#fff', fontSizeRatio: 0.62 } },
  { keys: ['hunyuan', '混元', '腾讯'], brand: { mark: '混', bg: '#0052D9', fg: '#fff', fontSizeRatio: 0.6 } },
  { keys: ['spark', '讯飞', '星火'], brand: { mark: '星', bg: '#3859FF', fg: '#fff', fontSizeRatio: 0.6 } },
  { keys: ['grok', 'xai'], brand: { mark: '𝕏', bg: '#000000', fg: '#fff', fontSizeRatio: 0.6 } },
  { keys: ['mistral'], brand: { mark: 'M', bg: '#FF7000', fg: '#fff', fontSizeRatio: 0.62 } },
]

const brand = computed<Brand>(() => {
  const hay = `${props.provider} ${props.name}`.toLowerCase()
  for (const { keys, brand: b } of BRANDS) {
    if (keys.some((k) => hay.includes(k.toLowerCase()))) return b
  }
  // 未识别：名称首字母 + 中性灰
  const ch = (props.name || '?').trim().charAt(0).toUpperCase() || '?'
  return { mark: ch, bg: '#6B7280', fg: '#fff', fontSizeRatio: 0.58 }
})

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  background: brand.value.bg,
  color: brand.value.fg || 'inherit',
  fontSize: `${Math.round(props.size * (brand.value.fontSizeRatio ?? 0.72))}px`,
  lineHeight: 1,
}))
</script>

<template>
  <span class="provider-icon" :style="style" :title="name">{{ brand.mark }}</span>
</template>

<style scoped>
.provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 25%;
  flex-shrink: 0;
  font-weight: 700;
  overflow: hidden;
  user-select: none;
}
</style>
