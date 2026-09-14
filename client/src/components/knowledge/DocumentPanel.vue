<template>
  <div class="document-panel">
    <div class="panel-header">
      <h3>知识库管理</h3>
      <el-icon class="close-icon" @click="$emit('close')"><Close /></el-icon>
    </div>

    <div class="panel-content">
      <!-- 知识库 Tab 栏 -->
      <div class="collection-tabs">
        <el-tabs
          :model-value="activeTab"
          @tab-change="handleTabChange"
          class="collection-tab-bar"
        >
          <el-tab-pane label="全部" name="__all__">
            <template #label>
              <span>📚 全部</span>
            </template>
          </el-tab-pane>
          <el-tab-pane
            v-for="col in chatStore.collections"
            :key="col.id"
            :label="col.name"
            :name="col.id"
          >
            <template #label>
              <span>{{ col.icon || '📄' }} {{ col.name }}</span>
            </template>
          </el-tab-pane>
        </el-tabs>
        <el-tooltip content="新建知识库" placement="top">
          <el-button circle size="small" @click="openCreateDialog">
            <el-icon><Plus /></el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <!-- 当前知识库描述 -->
      <div v-if="activeCollection" class="collection-desc">
        <span class="desc-icon">{{ activeCollection.icon || '📚' }}</span>
        <span class="desc-text">{{ activeCollection.description || activeCollection.name }}</span>
        <el-button text size="small" @click="openDeleteCollection">
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>

      <!-- 上传区域 -->
      <div class="upload-section">
        <el-upload
          drag
          :auto-upload="false"
          :on-change="handleFileChange"
          :file-list="fileList"
          accept=".pdf,.docx,.md,.txt"
          :limit="1"
        >
          <el-icon class="upload-icon"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽文件到此处，或<em>点击上传</em></div>
          <template #tip>
            <div class="el-upload__tip">
              支持 PDF / Word / Markdown / TXT，单个文件不超过 50MB
              <span v-if="activeCollection">（将归入「{{ activeCollection.name }}」）</span>
            </div>
          </template>
        </el-upload>

        <el-button
          type="primary"
          :loading="uploading"
          :disabled="fileList.length === 0"
          @click="handleUpload"
          style="margin-top: 12px; width: 100%"
        >
          {{ uploading ? '处理中...' : '上传并向量化' }}
        </el-button>
      </div>

      <!-- 文档列表 -->
      <div class="doc-list-section">
        <div class="section-header">
          <span>文档 ({{ chatStore.documents.length }})</span>
          <el-button text @click="chatStore.loadDocuments()">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>

        <div class="doc-list">
          <div
            v-for="doc in chatStore.documents"
            :key="doc.id"
            class="doc-item"
          >
            <div class="doc-icon">
              <el-icon :size="24"><Document /></el-icon>
            </div>
            <div class="doc-info">
              <div class="doc-name">{{ doc.name }}</div>
              <div class="doc-meta">
                <span>{{ formatSize(doc.size) }}</span>
                <span>·</span>
                <span>{{ doc.chunkCount }} 块</span>
                <span>·</span>
                <span>{{ formatTime(doc.uploadTime) }}</span>
              </div>
              <el-tag
                v-if="collectionNameOf(doc.collectionId)"
                size="small"
                effect="plain"
                class="doc-collection-tag"
              >
                {{ collectionNameOf(doc.collectionId) }}
              </el-tag>
            </div>
            <el-button
              type="primary"
              text
              size="small"
              @click="handlePreview(doc)"
            >
              <el-icon><View /></el-icon>
            </el-button>
            <el-button
              type="danger"
              text
              size="small"
              @click="handleDelete(doc.id)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>

          <div v-if="chatStore.documents.length === 0" class="empty">
            <el-icon :size="48" color="#c0c4cc"><FolderOpened /></el-icon>
            <p>暂无文档，上传文档后即可进行知识库问答</p>
          </div>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="stats-section">
        <div class="stat-card">
          <div class="stat-value">{{ chatStore.documents.length }}</div>
          <div class="stat-label">文档总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ chatStore.totalChunks }}</div>
          <div class="stat-label">向量块数</div>
        </div>
      </div>
    </div>

    <!-- 新建知识库弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建知识库" width="420px">
      <el-form label-width="60px">
        <el-form-item label="名称">
          <el-input v-model="newCollection.name" placeholder="如：产品手册、HR制度" maxlength="30" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="newCollection.icon" placeholder="Emoji，如 📚" maxlength="4" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newCollection.description" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreateCollection">创建</el-button>
      </template>
    </el-dialog>

    <!-- 文档预览弹窗 -->
    <el-dialog
      v-model="showPreview"
      :title="previewDoc?.name || '文档预览'"
      width="70%"
      top="5vh"
    >
      <div v-if="previewLoading" class="preview-loading">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <p>加载中...</p>
      </div>
      <div v-else class="preview-content">
        <div class="preview-meta">
          <el-tag size="small">{{ previewDoc?.chunkCount }} 个向量块</el-tag>
          <el-tag size="small" type="info">{{ formatSize(previewDoc?.size || 0) }}</el-tag>
        </div>
        <div class="preview-text">{{ previewContent }}</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Close,
  UploadFilled,
  Refresh,
  Document,
  Delete,
  FolderOpened,
  View,
  Loading,
  Plus,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import type { UploadFile } from 'element-plus'
import { getDocumentPreview } from '@/api'

defineEmits(['close'])

const chatStore = useChatStore()
const fileList = ref<UploadFile[]>([])
const uploading = ref(false)

// 当前 Tab：'__all__' 或 collectionId
const activeTab = ref<string>('__all__')

// 新建知识库弹窗
const showCreateDialog = ref(false)
const creating = ref(false)
const newCollection = ref({ name: '', icon: '📚', description: '' })

// 文档预览
const showPreview = ref(false)
const previewDoc = ref<any>(null)
const previewContent = ref('')
const previewLoading = ref(false)

const activeCollection = computed(() => {
  if (activeTab.value === '__all__') return null;
  return chatStore.collections.find(c => c.id === activeTab.value) || null;
})

function collectionNameOf(collectionId?: string | null): string {
  if (!collectionId) return '';
  return chatStore.collections.find(c => c.id === collectionId)?.name || '';
}

onMounted(async () => {
  await chatStore.loadCollections();
  await chatStore.loadDocuments();
})

function handleTabChange(name: string) {
  activeTab.value = name;
  const cid = name === '__all__' ? null : name;
  chatStore.setCurrentCollection(cid);
  chatStore.loadDocuments(cid || undefined);
}

function openCreateDialog() {
  newCollection.value = { name: '', icon: '📚', description: '' };
  showCreateDialog.value = true;
}

async function handleCreateCollection() {
  if (!newCollection.value.name.trim()) {
    ElMessage.warning('请输入知识库名称');
    return;
  }
  creating.value = true;
  try {
    const col = await chatStore.createCollection({ ...newCollection.value });
    ElMessage.success('知识库创建成功');
    showCreateDialog.value = false;
    // 自动切换到新建的知识库
    handleTabChange(col.id);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function openDeleteCollection() {
  if (!activeCollection.value) return;
  try {
    await ElMessageBox.confirm(
      `确定删除知识库「${activeCollection.value.name}」吗？其内文档将变为未分类，文档本身不会被删除。`,
      '删除知识库',
      { type: 'warning' }
    );
    await chatStore.removeCollection(activeCollection.value.id);
    ElMessage.success('知识库已删除');
    handleTabChange('__all__');
  } catch {
    // 取消
  }
}

function handleFileChange(file: UploadFile) {
  fileList.value = [file]
}

async function handleUpload() {
  if (fileList.value.length === 0 || !fileList.value[0].raw) return

  uploading.value = true
  try {
    await chatStore.uploadDoc(fileList.value[0].raw)
    ElMessage.success('文档上传并向量化成功！')
    fileList.value = []
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || error?.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

// 文档预览
async function handlePreview(doc: any) {
  showPreview.value = true
  previewDoc.value = doc
  previewLoading.value = true
  previewContent.value = ''
  try {
    const data = await getDocumentPreview(doc.id)
    previewContent.value = data.content
    previewDoc.value = { ...doc, chunkCount: data.chunkCount }
  } catch (e) {
    ElMessage.error('文档预览失败')
    console.error(e)
  } finally {
    previewLoading.value = false
  }
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除这个文档吗？相关的向量数据也会被删除。', '提示', {
      type: 'warning',
    })
    await chatStore.removeDocument(id)
    ElMessage.success('删除成功')
  } catch {
    // 用户取消
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}
</script>

<style scoped>
.document-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 400px;
  height: 100%;
  background: #fff;
  box-shadow: -2px 0 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e4e7ed;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-icon {
  font-size: 20px;
  cursor: pointer;
  color: #909399;
}

.close-icon:hover {
  color: #f56c6c;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px 16px;
}

/* 知识库 Tab 栏 */
.collection-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.collection-tab-bar {
  flex: 1;
  min-width: 0;
}

.collection-tab-bar :deep(.el-tabs__header) {
  margin: 0;
}

.collection-tab-bar :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.collection-tab-bar :deep(.el-tabs__item) {
  padding: 0 12px;
  height: 34px;
  line-height: 34px;
  font-size: 13px;
}

.collection-desc {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #606266;
}

.desc-icon {
  font-size: 14px;
}

.desc-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-section {
  margin-bottom: 24px;
}

.upload-icon {
  font-size: 48px;
  color: #409eff;
}

.doc-list-section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

.doc-list {
  max-height: 300px;
  overflow-y: auto;
}

.doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.2s;
}

.doc-item:hover {
  border-color: #409eff;
  background: #f5f7fa;
}

.doc-icon {
  color: #409eff;
  flex-shrink: 0;
}

.doc-info {
  flex: 1;
  min-width: 0;
}

.doc-name {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.doc-meta {
  font-size: 11px;
  color: #909399;
  display: flex;
  gap: 4px;
  align-items: center;
}

.doc-collection-tag {
  margin-top: 4px;
  height: 18px;
  line-height: 16px;
  padding: 0 6px;
}

.empty {
  text-align: center;
  padding: 40px 20px;
  color: #c0c4cc;
}

.empty p {
  margin-top: 12px;
  font-size: 13px;
}

.stats-section {
  display: flex;
  gap: 12px;
}

.stat-card {
  flex: 1;
  text-align: center;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  color: #fff;
}

.stat-card:last-child {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
}

.stat-label {
  font-size: 12px;
  opacity: 0.9;
  margin-top: 4px;
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .document-panel {
    width: 100%;
  }

  .panel-header {
    padding: 12px 16px;
  }

  .panel-content {
    padding: 12px;
  }

  .doc-item {
    padding: 10px 12px;
  }
}

/* 文档预览样式 */
.preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: #909399;
  gap: 12px;
}

.preview-content {
  max-height: 70vh;
  overflow-y: auto;
}

.preview-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e4e7ed;
}

.preview-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  line-height: 1.8;
  color: #303133;
  font-size: 14px;
}
</style>
