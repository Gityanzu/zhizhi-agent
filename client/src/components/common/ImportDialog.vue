<template>
  <el-dialog v-model="visible" title="导入对话" width="520px" :destroy-on-close="true">
    <el-radio-group v-model="source" style="margin-bottom: 16px">
      <el-radio-button value="chatgpt">ChatGPT 导出</el-radio-button>
      <el-radio-button value="claude">Claude 导出</el-radio-button>
    </el-radio-group>

    <el-upload
      drag
      :auto-upload="false"
      :show-file-list="false"
      accept=".json"
      :on-change="onFileChange"
    >
      <el-icon class="upload-icon"><UploadFilled /></el-icon>
      <div class="upload-text">点击或拖拽上传导出的 JSON 文件</div>
      <div class="upload-hint">ChatGPT：Settings → Data controls → Export data；Claude：Export data</div>
    </el-upload>

    <div v-if="fileName" class="selected-file">已选择：{{ fileName }}</div>

    <div v-if="result" class="result">
      <el-alert
        :type="result.failCount > 0 ? 'warning' : 'success'"
        :closable="false"
        :title="`成功导入 ${result.successCount} 个对话，失败 ${result.failCount} 个`"
      />
      <div v-if="result.errors && result.errors.length" class="err-list">
        <div v-for="(e, i) in result.errors.slice(0, 10)" :key="i" class="err-item">· {{ e }}</div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :loading="importing" :disabled="!file" @click="handleImport">开始导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const chatStore = useChatStore()
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const source = ref<'chatgpt' | 'claude'>('chatgpt')
const file = ref<File | null>(null)
const fileName = ref('')
const importing = ref(false)
const result = ref<any>(null)

function onFileChange(f: any) {
  file.value = f.raw as File
  fileName.value = f.name
  result.value = null
}

async function handleImport() {
  if (!file.value) return
  importing.value = true
  try {
    const res = await chatStore.importConversations(source.value, file.value)
    result.value = res
    ElMessage.success(`导入完成：成功 ${res.successCount}，失败 ${res.failCount}`)
  } catch (e: any) {
    ElMessage.error(e?.message || '导入失败')
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.upload-icon { font-size: 40px; color: var(--text-secondary); }
.upload-text { font-size: 14px; margin: 8px 0 4px; }
.upload-hint { font-size: 12px; color: var(--text-secondary); }
.selected-file { margin-top: 12px; font-size: 13px; color: var(--text-secondary); }
.result { margin-top: 16px; }
.err-list { margin-top: 8px; max-height: 160px; overflow-y: auto; }
.err-item { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
</style>
