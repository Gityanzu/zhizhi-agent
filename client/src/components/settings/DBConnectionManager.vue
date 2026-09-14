<template>
  <div class="db-connection-manager">
    <div class="header">
      <h3>数据库连接</h3>
      <el-button type="primary" size="small" @click="openEdit()">
        <el-icon><Plus /></el-icon> 新建连接
      </el-button>
    </div>

    <div class="conn-list">
      <div v-for="conn in chatStore.dbConnections" :key="conn.id" class="conn-card">
        <div class="conn-info">
          <div class="conn-name">
            <el-tag size="small" :type="conn.type === 'mysql' ? 'warning' : 'primary'">
              {{ conn.type === 'mysql' ? 'MySQL' : 'PostgreSQL' }}
            </el-tag>
            <span class="name-text">{{ conn.name }}</span>
          </div>
          <div class="conn-detail">{{ conn.host }}:{{ conn.port }} / {{ conn.database }} ({{ conn.username }})</div>
        </div>
        <div class="conn-actions">
          <el-button text size="small" @click="handleTest(conn)">
            <el-icon><Connection /></el-icon> 测试
          </el-button>
          <el-button text size="small" @click="openEdit(conn)">
            <el-icon><Edit /></el-icon>
          </el-button>
          <el-button text size="small" class="danger" @click="handleDelete(conn)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
      <div v-if="chatStore.dbConnections.length === 0" class="empty">
        暂无数据库连接，点击"新建连接"添加
      </div>
    </div>

    <!-- 编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑连接' : '新建连接'" width="560px">
      <el-form :model="form" label-width="90px" size="small">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="连接名称" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type">
            <el-option label="PostgreSQL" value="postgres" />
            <el-option label="MySQL" value="mysql" />
          </el-select>
        </el-form-item>
        <el-form-item label="主机">
          <el-input v-model="form.host" placeholder="localhost" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="form.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="数据库名">
          <el-input v-model="form.database" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="编辑时留空则不修改" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Edit, Delete, Connection } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)

const form = ref({
  name: '',
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  database: '',
  username: '',
  password: '',
})

function openEdit(conn?: any) {
  editingId.value = conn?.id || null
  if (conn) {
    form.value = {
      name: conn.name,
      type: conn.type,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      username: conn.username,
      password: '',
    }
  } else {
    form.value = {
      name: '', type: 'postgres', host: 'localhost',
      port: 5432, database: '', username: '', password: '',
    }
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.value.name || !form.value.database) {
    ElMessage.warning('请填写名称和数据库名')
    return
  }
  const data: any = { ...form.value }
  if (editingId.value) {
    data.id = editingId.value
    if (!data.password) delete data.password
  }
  await chatStore.saveDBConnection(data)
  ElMessage.success('保存成功')
  dialogVisible.value = false
}

async function handleTest(conn: any) {
  try {
    const res = await chatStore.testDBConnection(conn.id)
    if (res.success) ElMessage.success(res.message)
    else ElMessage.error(res.message)
  } catch (e: any) {
    ElMessage.error('测试失败: ' + (e?.message || e))
  }
}

async function handleDelete(conn: any) {
  await ElMessageBox.confirm(`确认删除连接 "${conn.name}"？`, '提示', { type: 'warning' })
  await chatStore.removeDBConnection(conn.id)
  ElMessage.success('已删除')
}

onMounted(() => {
  chatStore.loadDBConnections()
})
</script>

<style scoped>
.db-connection-manager { padding: 0; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.header h3 { margin: 0; font-size: 16px; }
.conn-list { display: flex; flex-direction: column; gap: 8px; }
.conn-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.conn-name { display: flex; align-items: center; gap: 8px; }
.name-text { font-weight: 600; font-size: 14px; color: var(--text-primary); }
.conn-detail { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.conn-actions { display: flex; gap: 4px; }
.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px 0;
  font-size: 13px;
}
</style>
