import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getUserSettings, setPermissionMode as apiSetPermissionMode } from '@/api/userSettings'

export type PermissionMode = 'sandbox' | 'full'

/**
 * 权限模式 —— Agent 能不能直接读写本机、要不要逐次确认。
 *
 * 服务端按用户存（user_permission_preferences），这里只是前端的一份共享缓存：
 * 输入框上的下拉和设置页共用同一份状态，否则两处各拉一次，切完另一边还显示旧值。
 *
 * 提示（ElMessage）刻意放在这里而不是各调用点：两个入口重复三行 toast，
 * 迟早会出现"一处提示、一处静默"的不一致。
 */
export const usePermissionStore = defineStore('permission', () => {
  /** 服务端存着的"用户选择" */
  const mode = ref<PermissionMode>('sandbox')
  /** 当前环境是否支持完全访问（Web 托管后端恒为 false，仅桌面端可用） */
  const fullAccessSupported = ref(false)
  const loaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)

  /**
   * 真正生效的模式：不支持的环境里，就算服务端存着 full，运行时也会被降级成 sandbox。
   * 界面展示与比较都用它 —— 显示"允许全部"却处处被拦是最难排查的不一致。
   */
  const effectiveMode = computed<PermissionMode>(() =>
    mode.value === 'full' && !fullAccessSupported.value ? 'sandbox' : mode.value
  )

  /** 设置页已经拉过整包设置，直接喂进来，省一次请求 */
  function applyFromSettings(data: any) {
    mode.value = data?.preferences?.permissionMode === 'full' ? 'full' : 'sandbox'
    fullAccessSupported.value = data?.fullAccessSupported === true
    loaded.value = true
  }

  async function ensureLoaded() {
    if (loaded.value || loading.value) return
    loading.value = true
    try {
      applyFromSettings(await getUserSettings())
    } catch (e) {
      console.error('加载权限模式失败', e)
    } finally {
      loading.value = false
    }
  }

  async function setMode(next: PermissionMode): Promise<boolean> {
    // 不支持的环境里下拉只有"本机默认"可选项，改它等于没改；
    // 更重要的是别发请求 —— 服务端可能存着桌面端设过的 full，无脑 PUT 会把那份授权冲掉
    if (!fullAccessSupported.value) return true
    if (next === mode.value) return true

    saving.value = true
    try {
      const res = await apiSetPermissionMode(next)
      mode.value = res.mode
      fullAccessSupported.value = res.fullAccessSupported === true
      ElMessage.success(
        next === 'full'
          ? '已允许全部权限：Agent 读写本机文件、执行命令不再逐次确认'
          : '已恢复本机默认权限：越界读写与执行命令前会先确认'
      )
      return true
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.error || e?.message || '切换权限模式失败')
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    mode,
    effectiveMode,
    fullAccessSupported,
    loaded,
    loading,
    saving,
    applyFromSettings,
    ensureLoaded,
    setMode,
  }
})
