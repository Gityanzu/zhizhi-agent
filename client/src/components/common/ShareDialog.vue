<template>
  <el-dialog v-model="visible" title="分享对话" width="520px" :destroy-on-close="true" @closed="onClosed">
    <div v-if="!shareUrl" class="share-config">
      <div class="form-row">
        <label>有效期</label>
        <el-select v-model="expiresInHours" style="width: 100%">
          <el-option label="1 天" :value="24" />
          <el-option label="7 天" :value="168" />
          <el-option label="永久有效" :value="0" />
        </el-select>
      </div>
      <div class="form-row">
        <label>访问密码（可选）</label>
        <el-input v-model="password" placeholder="留空则无需密码" />
      </div>
      <div class="actions">
        <el-button type="primary" :loading="creating" @click="handleCreate">创建分享链接</el-button>
      </div>
    </div>

    <div v-else class="share-result">
      <el-alert type="success" :closable="false" title="分享链接已创建" />
      <div class="link-box">
        <el-input v-model="shareUrl" readonly>
          <template #append>
            <el-button @click="copyLink">复制</el-button>
          </template>
        </el-input>
      </div>
      <div class="meta">
        <span v-if="password">已启用密码保护</span>
        <span v-else>公开访问</span>
        <span>·</span>
        <span>{{ expiresText }}</span>
      </div>
      <div class="actions">
        <el-button type="danger" plain @click="handleRevoke">撤销分享</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{ modelValue: boolean; sessionId: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const chatStore = useChatStore()
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const expiresInHours = ref(168)
const password = ref('')
const creating = ref(false)
const shareUrl = ref('')
const shareId = ref('')

const expiresText = computed(() => {
  if (expiresInHours.value === 0) return '永久有效'
  return expiresInHours.value === 24 ? '1 天后过期' : '7 天后过期'
})

async function handleCreate() {
  if (!props.sessionId) {
    ElMessage.warning('请先选择一个对话')
    return
  }
  creating.value = true
  try {
    const res = await chatStore.createShare({
      sessionId: props.sessionId,
      password: password.value || undefined,
      expiresInHours: expiresInHours.value || undefined,
    })
    shareId.value = res.id
    shareUrl.value = `${location.origin}${res.url}`
    ElMessage.success('分享链接已创建')
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function handleRevoke() {
  try {
    await chatStore.revokeShare(shareId.value)
    ElMessage.success('分享已撤销')
    visible.value = false
  } catch (e: any) {
    ElMessage.error(e?.message || '撤销失败')
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    ElMessage.success('链接已复制')
  } catch {
    ElMessage.warning('复制失败，请手动复制')
  }
}

function onClosed() {
  shareUrl.value = ''
  shareId.value = ''
  password.value = ''
  expiresInHours.value = 168
}
</script>

<style scoped>
.form-row { margin-bottom: 16px; }
.form-row label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.actions { margin-top: 8px; }
.link-box { margin: 16px 0 8px; }
.meta { font-size: 12px; color: var(--text-secondary); display: flex; gap: 8px; align-items: center; }
</style>
