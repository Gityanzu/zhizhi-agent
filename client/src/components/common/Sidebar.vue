<template>
  <aside class="sidebar">
    <!-- 页面导航 -->
    <div class="page-nav">
      <div
        v-for="nav in navItems"
        :key="nav.path"
        class="page-nav-item"
        :class="{ active: currentPath === nav.path }"
        @click="navigateTo(nav.path)"
      >
        <el-icon><component :is="nav.icon" /></el-icon>
        <span>{{ nav.name }}</span>
      </div>
    </div>

    <!-- 仅聊天页面显示会话管理 -->
    <template v-if="isChatPage">
      <div class="sidebar-header">
        <button class="new-chat-btn" @click="chatStore.newSession()">
          <el-icon><Plus /></el-icon>
          <span>新建对话</span>
        </button>
        <button class="new-folder-btn" @click="handleNewFolder">
          <el-icon><FolderAdd /></el-icon>
          <span>新建文件夹</span>
        </button>
        <button class="import-btn" @click="emit('import')">
          <el-icon><Upload /></el-icon>
          <span>导入对话</span>
        </button>
      </div>

      <div class="session-list">
      <!-- 文件夹筛选 -->
      <div class="folder-nav">
        <div
          class="nav-item"
          :class="{ active: chatStore.activeFolderFilter === null }"
          @click="setFolderFilter(null)"
        >
          <el-icon><Files /></el-icon>
          <span>全部对话</span>
        </div>
        <div
          v-for="folder in chatStore.folders"
          :key="folder.id"
          class="nav-item folder-nav-item"
          :class="{ active: chatStore.activeFolderFilter === folder.id }"
          @click="setFolderFilter(folder.id)"
          @dragover.prevent
          @drop="onDropToFolder(folder.id, $event)"
        >
          <el-icon><Folder /></el-icon>
          <span class="folder-nav-name">{{ folder.icon }} {{ folder.name }}</span>
          <span class="folder-count">{{ countOfFolder(folder.id) }}</span>
          <el-icon class="folder-more" @click.stop="openFolderMenu($event, folder)"><MoreFilled /></el-icon>
        </div>
      </div>

      <!-- 标签筛选 -->
      <div v-if="chatStore.allTags.length > 0" class="tag-filter">
        <div class="section-title">标签筛选</div>
        <div class="tag-chips">
          <span
            v-for="t in chatStore.allTags"
            :key="t"
            class="tag-chip"
            :class="{ active: chatStore.activeTagFilter === t }"
            @click="toggleTagFilter(t)"
          >{{ t }}</span>
        </div>
      </div>

      <!-- 置顶会话 -->
      <template v-if="pinnedSessions.length > 0">
        <div class="section-title">已置顶</div>
        <div
          v-for="session in pinnedSessions"
          :key="session.id"
          class="session-item pinned"
          :class="{ active: session.id === chatStore.currentSessionId }"
          draggable="true"
          @dragstart="onDragStart(session.id, $event)"
          @click="handleSelectSession(session.id)"
        >
          <el-icon class="pin-icon"><Top /></el-icon>
          <span class="session-title">{{ session.title }}</span>
          <span v-if="(session.tags || []).length" class="tag-dots">{{ (session.tags || []).length }}个标签</span>
          <el-dropdown trigger="click" @command="(cmd: string) => handleSessionCommand(cmd, session)" @click.stop>
            <el-icon class="more-icon"><MoreFilled /></el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="pin">取消置顶</el-dropdown-item>
                <el-dropdown-item command="folder">移动到文件夹</el-dropdown-item>
                <el-dropdown-item command="tags">编辑标签</el-dropdown-item>
                <el-dropdown-item command="share">分享对话</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </template>

      <!-- 普通会话 -->
      <div class="section-title">{{ pinnedSessions.length > 0 ? '其他对话' : '历史对话' }}</div>
      <div
        v-for="session in unpinnedSessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === chatStore.currentSessionId }"
        draggable="true"
        @dragstart="onDragStart(session.id, $event)"
        @click="handleSelectSession(session.id)"
      >
        <el-icon class="session-icon"><ChatDotRound /></el-icon>
        <div class="session-main">
          <span class="session-title">{{ session.title }}</span>
          <div v-if="(session.tags || []).length" class="session-tags">
            <span
              v-for="t in (session.tags || []).slice(0, 3)"
              :key="t"
              class="mini-tag"
              @click.stop="toggleTagFilter(t)"
            >{{ t }}</span>
          </div>
        </div>
        <el-dropdown trigger="click" @command="(cmd: string) => handleSessionCommand(cmd, session)" @click.stop>
          <el-icon class="more-icon"><MoreFilled /></el-icon>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="pin">置顶</el-dropdown-item>
              <el-dropdown-item command="folder">移动到文件夹</el-dropdown-item>
              <el-dropdown-item command="tags">编辑标签</el-dropdown-item>
              <el-dropdown-item command="share">分享对话</el-dropdown-item>
              <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div v-if="chatStore.filteredSessions.length === 0" class="empty-tip">
        暂无历史对话
      </div>
    </div>
    </template>

    <div class="sidebar-footer">
      <div class="stats">
        <div class="stat-item">
          <span class="stat-value">{{ chatStore.documents.length }}</span>
          <span class="stat-label">文档</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ chatStore.totalChunks }}</span>
          <span class="stat-label">向量块</span>
        </div>
      </div>
      <div class="user-info" @click="handleUserClick">
        <div class="user-avatar">
          <img v-if="displayAvatar" :src="displayAvatar" alt="头像" />
          <el-icon v-else><User /></el-icon>
        </div>
        <div class="user-detail">
          <div class="user-name">{{ displayName }}</div>
          <div class="user-role">{{ displayRole }}</div>
        </div>
        <el-dropdown v-if="authStore.isAuthenticated" trigger="click" @command="handleUserCommand" class="user-dropdown" @click.stop>
          <div class="user-more-btn">
            <el-icon class="more-icon"><MoreFilled /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="settings">设置</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, ChatDotRound, User, Folder, FolderAdd, Files, MoreFilled, Top, Upload, Collection, Service, Operation, Setting, DataAnalysis } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// 页面导航
const navItems = [
  { path: '/chat', name: '聊天', icon: ChatDotRound },
  { path: '/knowledge', name: '知识库', icon: Collection },
  { path: '/agents', name: 'Agent', icon: Service },
  { path: '/workflow', name: '工作流', icon: Operation },
  { path: '/analytics', name: '分析', icon: DataAnalysis },
  { path: '/settings', name: '设置', icon: Setting },
]

const currentPath = computed(() => route.path)
const isChatPage = computed(() => route.path === '/chat' || route.path === '/')

function navigateTo(path: string) {
  router.push(path)
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const userProfile = ref({ nickname: '用户', role: 'AI助手使用者', avatar: '' })

// 显示用户信息（优先使用登录用户，回退到本地设置）
const displayName = computed(() => {
  if (authStore.isAuthenticated && authStore.user) {
    return authStore.user.nickname || authStore.user.username
  }
  return userProfile.value.nickname
})

const displayRole = computed(() => {
  if (authStore.isAuthenticated && authStore.user) {
    return authStore.user.role === 'user' ? '已登录用户' : authStore.user.role
  }
  return userProfile.value.role
})

const displayAvatar = computed(() => {
  if (authStore.isAuthenticated && authStore.user?.avatar) {
    return authStore.user.avatar
  }
  return userProfile.value.avatar
})

function handleUserClick() {
  if (!authStore.isAuthenticated) {
    router.push('/login')
  } else {
    uiStore.openSettings()
  }
}

function handleUserCommand(command: string) {
  if (command === 'settings') {
    uiStore.openSettings()
  } else if (command === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '确认退出', {
      type: 'warning',
      confirmButtonText: '退出',
      cancelButtonText: '取消'
    }).then(() => {
      authStore.logout()
      ElMessage.success('已退出登录')
      router.push('/chat')
    }).catch(() => {})
  }
}

async function loadUserProfile() {
  try {
    const res = await axios.get(`${API_BASE}/api/user/settings`)
    if (res.data?.profile) {
      userProfile.value = res.data.profile
    }
  } catch (e) {
    // 静默失败，使用默认值
  }
}

function onSettingsUpdated() {
  loadUserProfile()
}

onMounted(() => {
  loadUserProfile()
  window.addEventListener('user-settings-updated', onSettingsUpdated)
})

onUnmounted(() => {
  window.removeEventListener('user-settings-updated', onSettingsUpdated)
})
import type { SessionInfo } from '@/types'

const emit = defineEmits<{
  (e: 'session-selected'): void
  (e: 'import'): void
  (e: 'share', session: SessionInfo): void
}>()

const chatStore = useChatStore()
const uiStore = useUiStore()
const draggedSessionId = ref<string | null>(null)

const pinnedSessions = computed(() => chatStore.filteredSessions.filter(s => s.isPinned))
const unpinnedSessions = computed(() => chatStore.filteredSessions.filter(s => !s.isPinned))

function countOfFolder(folderId: string): number {
  return chatStore.sessions.filter(s => s.folderId === folderId).length
}

function setFolderFilter(id: string | null) {
  chatStore.activeFolderFilter = id
  chatStore.activeTagFilter = null
  chatStore.loadSessions()
}

function toggleTagFilter(tag: string) {
  chatStore.activeTagFilter = chatStore.activeTagFilter === tag ? null : tag
  chatStore.loadSessions()
}

function onDragStart(sessionId: string, e: DragEvent) {
  draggedSessionId.value = sessionId
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

async function onDropToFolder(folderId: string, e: DragEvent) {
  e.preventDefault()
  if (!draggedSessionId.value) return
  await chatStore.moveToFolder(draggedSessionId.value, folderId)
  ElMessage.success('已移动到文件夹')
  draggedSessionId.value = null
}

async function handleNewFolder() {
  try {
    const { value } = await ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
      inputPlaceholder: '例如：工作 / 学习 / 生活',
    })
    if (value?.trim()) {
      await chatStore.createFolder(value.trim())
      ElMessage.success('文件夹已创建')
    }
  } catch { /* 取消 */ }
}

function openFolderMenu(e: MouseEvent, folder: any) {
  // 简单：提供重命名 / 删除
  ElMessageBox.confirm(
    `是否删除文件夹「${folder.name}」？其内对话将移至未归类。`,
    '删除文件夹',
    { type: 'warning' }
  ).then(async () => {
    await chatStore.removeFolder(folder.id)
    ElMessage.success('文件夹已删除')
  }).catch(() => {})
}

async function handleSessionCommand(cmd: string, session: SessionInfo) {
  switch (cmd) {
    case 'pin':
      await chatStore.togglePin(session.id)
      break
    case 'share':
      emit('share', session)
      break
    case 'delete':
      try {
        await ElMessageBox.confirm('确定要删除这个对话吗？', '提示', { type: 'warning' })
        await chatStore.removeSession(session.id)
        ElMessage.success('删除成功')
      } catch { /* 取消 */ }
      break
    case 'folder': {
      // 选择目标文件夹
      const folders = chatStore.folders
      if (folders.length === 0) {
        ElMessage.warning('请先新建文件夹')
        return
      }
      const options = folders.map(f => `${f.icon || '📁'} ${f.name}`).join('\n')
      try {
        const { value } = await ElMessageBox.prompt(
          `输入要移动到的文件夹序号（1-${folders.length}），输入 0 表示移出文件夹：\n${folders.map((f, i) => `${i + 1}. ${f.name}`).join('\n')}`,
          '移动到文件夹',
          { inputPlaceholder: '序号' }
        )
        const idx = parseInt(value, 10)
        if (idx === 0) {
          await chatStore.moveToFolder(session.id, null)
        } else if (idx >= 1 && idx <= folders.length) {
          await chatStore.moveToFolder(session.id, folders[idx - 1].id)
        }
      } catch { /* 取消 */ }
      break
    }
    case 'tags': {
      try {
        const { value } = await ElMessageBox.prompt(
          '输入标签，用逗号分隔：',
          '编辑标签',
          { inputValue: (session.tags || []).join(',') }
        )
        const tags = (value || '').split(/[,，]/).map(s => s.trim()).filter(Boolean)
        await chatStore.updateTags(session.id, tags)
        ElMessage.success('标签已更新')
      } catch { /* 取消 */ }
      break
    }
  }
}

function handleSelectSession(id: string) {
  chatStore.switchSession(id)
  // 如果当前不在聊天页面，自动跳转到聊天页面
  if (!isChatPage.value) {
    router.push('/chat')
  }
  emit('session-selected')
}
</script>

<style scoped>
.sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  height: 100%;
  transition: background-color 0.3s, border-color 0.3s;
}

/* 页面导航 */
.page-nav {
  padding: 12px 8px 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid var(--border-color);
}

.page-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.2s;
  flex: 1;
  min-width: 70px;
  justify-content: center;
}

.page-nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.page-nav-item.active {
  background: var(--primary-light);
  color: var(--primary-color);
  font-weight: 500;
}

.sidebar-header {
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.new-chat-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--primary-gradient);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.new-chat-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.new-chat-btn:active {
  transform: translateY(0);
}

.new-folder-btn,
.import-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.new-folder-btn:hover,
.import-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--primary);
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
}

/* 文件夹导航 */
.folder-nav {
  margin-bottom: 12px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--primary-light);
  color: var(--primary);
  font-weight: 500;
}

.folder-nav-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  font-size: 11px;
  color: var(--text-placeholder);
}

.folder-more {
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;
}

.folder-nav-item:hover .folder-more {
  opacity: 1;
}

.section-title {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 12px 0 6px;
  padding: 0 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  opacity: 0.7;
}

/* 标签筛选 */
.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 8px 6px;
}

.tag-chip {
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.tag-chip:hover {
  background: var(--bg-hover);
}

.tag-chip.active {
  background: var(--primary);
  color: #fff;
}

.session-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  margin-bottom: 2px;
  transition: all 0.15s ease;
  position: relative;
  color: var(--text-secondary);
  gap: 8px;
}

.session-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.session-item.active {
  background: var(--primary-light);
  color: var(--primary);
  font-weight: 500;
}

.pin-icon {
  color: var(--warning);
  font-size: 14px;
  flex-shrink: 0;
}

.session-icon {
  font-size: 16px;
  flex-shrink: 0;
  opacity: 0.7;
}

.session-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-title {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.mini-tag {
  font-size: 10px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.mini-tag:hover {
  color: var(--primary);
}

.tag-dots {
  font-size: 10px;
  color: var(--text-placeholder);
  flex-shrink: 0;
}

.more-icon {
  font-size: 15px;
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.session-item:hover .more-icon {
  opacity: 1;
}

.empty-tip {
  text-align: center;
  color: var(--text-placeholder);
  font-size: 13px;
  padding: 40px 20px;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.stats {
  display: flex;
  justify-content: space-around;
  margin-bottom: 12px;
  padding: 12px 8px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-lg);
}

.stat-item {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  background: var(--primary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 2px;
}

.stat-label {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: var(--radius);
  transition: background 0.2s;
  cursor: pointer;
}

.user-info:hover {
  background: var(--bg-hover);
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  flex-shrink: 0;
}

.user-detail {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.user-role {
  font-size: 11px;
  color: var(--text-secondary);
}

.user-dropdown {
  margin-left: auto;
}

.user-more-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.user-more-btn:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.1));
}

.more-icon {
  font-size: 16px;
  color: var(--text-secondary);
}

/* ========== 响应式 ========== */
@media (max-width: 1024px) {
  .sidebar {
    width: 220px;
  }
}

@media (max-width: 768px) {
  .sidebar {
    width: 100%;
    height: 100%;
  }

  .session-list {
    padding: 8px;
  }

  .session-item {
    padding: 8px 10px;
  }

  .sidebar-footer {
    padding: 12px;
  }
}
</style>
