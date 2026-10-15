import { ElMessage } from 'element-plus'

/**
 * usePreviewWindow — 在独立窗口里打开预览（文件或网址）
 *
 * 桌面端交给主进程开真实窗口（可拖到第二块屏幕、可多开）；
 * Web 端没有"独立窗口"这回事，用 window.open 开一个普通标签页，
 * 路由本身是个地址，所以两边共用同一套 /preview-window 页面。
 *
 * 注意这里不做多路复用：同一个文件点两次就开两个窗口，是有意为之 ——
 * 对比两份文件、或把同一个文件摊在两个屏幕上是真实需求，
 * 复用会让人"明明点了却没反应"。
 */
export function usePreviewWindow() {
  async function openPreview(payload: { path?: string; url?: string; title?: string }) {
    if (!payload.path && !payload.url) return false

    const desktop = typeof window !== 'undefined' ? window.desktop : undefined
    if (desktop) {
      const res = await desktop.window.openPreview(payload)
      if (!res.ok) {
        ElMessage.error(res.error || '打开预览窗口失败')
        return false
      }
      return true
    }

    const params = new URLSearchParams()
    if (payload.path) params.set('path', payload.path)
    if (payload.url) params.set('url', payload.url)
    window.open(
      `${window.location.origin}/preview-window?${params.toString()}`,
      '_blank',
      'width=1180,height=860,noopener'
    )
    return true
  }

  return { openPreview }
}
