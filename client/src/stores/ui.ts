import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * UI状态管理Store
 * 统一管理全局弹窗、抽屉等UI状态
 */
export const useUiStore = defineStore('ui', () => {
  // 用户设置弹窗
  const showSettings = ref(false)

  // 数据库查询弹窗
  const showDbQuery = ref(false)

  // 模型对比弹窗
  const showModelCompare = ref(false)

  // 语音设置弹窗
  const showVoiceSettings = ref(false)

  // 分享弹窗
  const showShare = ref(false)
  const shareSessionId = ref<string | null>(null)

  // 导入对话弹窗
  const showImport = ref(false)

  function toggleSettings() {
    showSettings.value = !showSettings.value
  }

  function openSettings() {
    showSettings.value = true
  }

  function closeSettings() {
    showSettings.value = false
  }

  function toggleDbQuery() {
    showDbQuery.value = !showDbQuery.value
  }

  function toggleModelCompare() {
    showModelCompare.value = !showModelCompare.value
  }

  function toggleVoiceSettings() {
    showVoiceSettings.value = !showVoiceSettings.value
  }

  function openShare(sessionId: string) {
    shareSessionId.value = sessionId
    showShare.value = true
  }

  function closeShare() {
    showShare.value = false
    shareSessionId.value = null
  }

  function toggleImport() {
    showImport.value = !showImport.value
  }

  return {
    showSettings,
    showDbQuery,
    showModelCompare,
    showVoiceSettings,
    showShare,
    shareSessionId,
    showImport,
    toggleSettings,
    openSettings,
    closeSettings,
    toggleDbQuery,
    toggleModelCompare,
    toggleVoiceSettings,
    openShare,
    closeShare,
    toggleImport,
  }
})
