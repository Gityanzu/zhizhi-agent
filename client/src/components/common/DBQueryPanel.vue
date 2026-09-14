<template>
  <div class="db-query-panel">
    <div class="header">
      <h3>数据库自然语言查询</h3>
    </div>

    <!-- 连接选择 -->
    <el-select v-model="selectedConnId" placeholder="选择数据库连接" class="conn-select" @change="handleConnChange">
      <el-option
        v-for="conn in chatStore.dbConnections"
        :key="conn.id"
        :label="`${conn.name} (${conn.type})`"
        :value="conn.id"
      />
    </el-select>
    <el-button text size="small" @click="refreshSchema" :disabled="!selectedConnId">
      <el-icon><Refresh /></el-icon> 刷新表结构
    </el-button>

    <!-- 表结构展示 -->
    <div v-if="schema.length > 0" class="schema-box">
      <div class="schema-title">表结构（{{ schema.length }}张表）</div>
      <div class="schema-tables">
        <el-tag v-for="t in schema" :key="t.tableName" size="small" effect="plain" class="schema-tag">
          {{ t.tableName }}（{{ t.columns.length }}列）
        </el-tag>
      </div>
    </div>

    <!-- 自然语言输入 -->
    <el-input
      v-model="question"
      type="textarea"
      :rows="2"
      placeholder="用自然语言提问，如：查询销售额最高的前5个产品"
      class="nl-input"
    />
    <el-button type="primary" size="small" @click="handleGenerateSQL" :loading="generating" :disabled="!selectedConnId">
      <el-icon><MagicStick /></el-icon> 生成SQL
    </el-button>

    <!-- SQL 预览 -->
    <el-input
      v-model="sql"
      type="textarea"
      :rows="3"
      placeholder="生成的 SQL 会显示在这里，可手动编辑"
      class="sql-input"
    />
    <el-button type="success" size="small" @click="handleExecute" :loading="executing" :disabled="!sql.trim()">
      <el-icon><VideoPlay /></el-icon> 执行查询
    </el-button>

    <!-- 结果表格 -->
    <div v-if="result" class="result-box">
      <div class="result-title">查询结果（{{ result.rowCount }}行）</div>
      <el-table :data="tableData" size="small" border max-height="300" class="result-table">
        <el-table-column
          v-for="col in result.columns"
          :key="col"
          :prop="col"
          :label="col"
          show-overflow-tooltip
        />
      </el-table>

      <!-- 简单CSS柱状图：对第一列数值列绘制 -->
      <div v-if="chartRows.length > 0" class="chart-box">
        <div class="chart-title">数据可视化（前10行）</div>
        <div v-for="(row, i) in chartRows" :key="i" class="chart-row">
          <span class="chart-label">{{ row.label }}</span>
          <div class="chart-bar-wrap">
            <div class="chart-bar" :style="{ width: row.pct + '%' }"></div>
          </div>
          <span class="chart-value">{{ row.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { MagicStick, VideoPlay, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const selectedConnId = ref('')
const question = ref('')
const sql = ref('')
const schema = ref<any[]>([])
const result = ref<any>(null)
const generating = ref(false)
const executing = ref(false)

async function handleConnChange() {
  schema.value = []
  result.value = null
  if (selectedConnId.value) await refreshSchema()
}

async function refreshSchema() {
  if (!selectedConnId.value) return
  try {
    const res = await chatStore.getDBSchema(selectedConnId.value)
    schema.value = res.schema || []
  } catch (e: any) {
    ElMessage.error('获取表结构失败: ' + (e?.message || e))
  }
}

async function handleGenerateSQL() {
  if (!question.value.trim()) {
    ElMessage.warning('请输入自然语言问题')
    return
  }
  generating.value = true
  try {
    const res = await chatStore.queryDB(selectedConnId.value, { question: question.value })
    sql.value = res.sql || ''
    result.value = { columns: res.columns, rows: res.rows, rowCount: res.rowCount }
  } catch (e: any) {
    ElMessage.error('生成SQL失败: ' + (e?.message || e))
  } finally {
    generating.value = false
  }
}

async function handleExecute() {
  executing.value = true
  try {
    const res = await chatStore.queryDB(selectedConnId.value, { sql: sql.value })
    result.value = { columns: res.columns, rows: res.rows, rowCount: res.rowCount }
    ElMessage.success(`查询成功，返回${res.rowCount}行`)
  } catch (e: any) {
    ElMessage.error('查询失败: ' + (e?.message || e))
  } finally {
    executing.value = false
  }
}

// 表格数据
const tableData = computed(() => {
  if (!result.value) return []
  return result.value.rows.slice(0, 100)
})

// 柱状图：取前10行，第一列文本为label，第二个数值列作为value
const chartRows = computed(() => {
  if (!result.value || result.value.rows.length === 0) return []
  const rows = result.value.rows.slice(0, 10)
  const cols = result.value.columns
  if (cols.length < 2) return []
  // 找到第一个数值列
  let valueCol = -1
  for (let i = 1; i < cols.length; i++) {
    if (rows.every((r: any) => typeof r[cols[i]] === 'number')) {
      valueCol = i
      break
    }
  }
  if (valueCol < 0) return []
  const labelCol = cols[0]
  const numCol = cols[valueCol]
  const maxVal = Math.max(...rows.map((r: any) => Math.abs(Number(r[numCol]) || 0)), 1)
  return rows.map((r: any) => ({
    label: String(r[labelCol]).slice(0, 12),
    value: r[numCol],
    pct: Math.round((Math.abs(Number(r[numCol]) || 0) / maxVal) * 100),
  }))
})
</script>

<style scoped>
.db-query-panel { display: flex; flex-direction: column; gap: 10px; }
.header h3 { margin: 0; font-size: 16px; }
.conn-select { width: 100%; }
.schema-box {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px;
}
.schema-title { font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
.schema-tables { display: flex; flex-wrap: wrap; gap: 4px; }
.schema-tag { margin: 0; }
.result-box {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px;
}
.result-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.result-table { width: 100%; }
.chart-box { margin-top: 12px; }
.chart-title { font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
.chart-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
}
.chart-label { width: 80px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chart-bar-wrap {
  flex: 1;
  background: var(--bg-tertiary);
  border-radius: 3px;
  height: 14px;
}
.chart-bar {
  background: var(--primary);
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}
.chart-value { width: 60px; text-align: right; flex-shrink: 0; }
</style>
