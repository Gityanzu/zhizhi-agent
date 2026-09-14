  <template>
  <div class="document-panel">
    <div class="panel-header">
      <h3>知识库管理</h3>
      <el-icon class="close-icon" @click="$emit('close')"><Close /></el-icon>
    </div>
    
    <div class="panel-content">
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
              支持 PDF / Word / Markdown / TXT 格式，单个文件不超过 50MB
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
          <span>已上传文档 ({{ chatStore.documents.length }})</span>
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
                <span>{{ doc.chunkCount }} 个向量块</span>
                <span>·</span>
                <span>{{ formatTime(doc.uploadTime) }}</span>
              </div>
            </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  Close,
  UploadFilled,
  Refresh,
  Document,
  Delete,
  FolderOpened,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import type { UploadFile } from 'element-plus'

defineEmits(['close'])

const chatStore = useChatStore()
const fileList = ref<UploadFile[]>([])
const uploading = ref(false)

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
  padding: 16px 20px;
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
</style>
