<script setup lang="ts">
/**
 * SkillsView — 技能商店（对标 SkillHub）
 *
 * 商店页签：精选技能横排 + 分类页签 + 搜索 + 技能卡片网格（安装/卸载）。
 * 已安装页签：启用/详情/卸载/重载技能库。
 * 「添加技能」弹窗：创建技能（表单）或上传 SKILL.md（服务端解析 frontmatter 后安装）。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus, Delete, View, CircleCheck, Search, UploadFilled, EditPen } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import {
  getSkills, switchSkill, reloadSkills, getSkillDetail,
  getSkillMarket, installSkill, uninstallFileSkill, uploadSkillFile,
  type MarketSkill,
} from '@/api/agent'
import SkillDetailDialog from '@/components/common/SkillDetailDialog.vue'

const router = useRouter()
const activeTab = ref('store') // store | installed
const loading = ref(false)
const skills = ref<any[]>([])
const categories = ref<string[]>([])
const market = ref<MarketSkill[]>([])
const installingId = ref('')
const uninstallingId = ref('')
const reloading = ref(false)
const showDetail = ref(false)
const detailSkillId = ref('')

/* ---------------- 搜索与分类筛选 ---------------- */
const searchQuery = ref('')
const activeCategory = ref('全部')

const filteredMarket = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return market.value.filter((s) => {
    if (activeCategory.value !== '全部' && s.category !== activeCategory.value) return false
    if (!q) return true
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.triggerKeywords.some((k) => k.toLowerCase().includes(q))
    )
  })
})

const featuredSkills = computed(() => market.value.filter((s) => s.featured))

function formatDownloads(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}w` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

async function loadInstalled() {
  loading.value = true
  try {
    const res = await getSkills()
    skills.value = res.skills || []
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '加载技能列表失败')
  } finally {
    loading.value = false
  }
}

async function loadMarket() {
  loading.value = true
  try {
    const { categories: cats, skills: list } = await getSkillMarket()
    categories.value = cats
    market.value = list
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '加载技能市场失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadInstalled()
  loadMarket()
})

async function handleReload() {
  reloading.value = true
  try {
    const r = await reloadSkills()
    if (r.success) {
      ElMessage.success(r.message || '技能库已重载')
      await Promise.all([loadInstalled(), loadMarket()])
    } else {
      ElMessage.error(r.error || '重载失败')
    }
  } finally {
    reloading.value = false
  }
}

async function handleSwitch(id: string) {
  try {
    const r = await switchSkill(id)
    if (r.success) {
      ElMessage.success(`已启用 ${r.skill?.name || id}`)
      await loadInstalled()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '启用失败')
  }
}

function openDetail(id: string) {
  detailSkillId.value = id
  showDetail.value = true
}

async function handleUninstall(s: { id: string; name: string }) {
  try {
    await ElMessageBox.confirm(`确定卸载技能「${s.name}」？其 SKILL.md 文件将被删除。`, '卸载技能', { type: 'warning' })
  } catch {
    return
  }
  uninstallingId.value = s.id
  try {
    await uninstallFileSkill(s.id)
    ElMessage.success('已卸载')
    await Promise.all([loadInstalled(), loadMarket()])
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '卸载失败（内置技能不可卸载）')
  } finally {
    uninstallingId.value = ''
  }
}

async function handleInstall(s: MarketSkill) {
  installingId.value = s.id
  try {
    await installSkill({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      version: s.version,
      triggerKeywords: s.triggerKeywords,
      systemPrompt: s.systemPrompt,
      allowedTools: s.allowedTools,
    })
    ElMessage.success(`已安装「${s.name}」`)
    await Promise.all([loadInstalled(), loadMarket()])
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '安装失败')
  } finally {
    installingId.value = ''
  }
}

/* ---------------- 添加技能弹窗（创建 / 上传） ---------------- */
const showAdd = ref(false)
const addMode = ref<'create' | 'upload'>('create')
const creating = ref(false)
const uploading = ref(false)
const uploadRef = ref<HTMLInputElement | null>(null)
const uploadFileName = ref('')

const createForm = ref({ id: '', name: '', icon: '🧩', description: '', keywords: '', prompt: '' })

function openAdd() {
  showAdd.value = true
}

function onUploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) uploadFileName.value = file.name
}

async function handleUpload() {
  const input = uploadRef.value
  const file = input?.files?.[0]
  if (!file) {
    ElMessage.warning('请选择 SKILL.md 文件')
    return
  }
  uploading.value = true
  try {
    await uploadSkillFile(file)
    ElMessage.success('上传并安装成功')
    showAdd.value = false
    uploadFileName.value = ''
    if (input) input.value = ''
    await Promise.all([loadInstalled(), loadMarket()])
    activeTab.value = 'installed'
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function handleCreate() {
  const f = createForm.value
  if (!f.id.trim() || !f.name.trim() || !f.prompt.trim()) {
    ElMessage.warning('id、名称、提示词（正文）为必填')
    return
  }
  creating.value = true
  try {
    await installSkill({
      id: f.id.trim(),
      name: f.name.trim(),
      description: f.description.trim(),
      icon: f.icon.trim() || '🧩',
      triggerKeywords: f.keywords.split(/[,，\s]+/).filter(Boolean),
      systemPrompt: f.prompt,
    })
    ElMessage.success('创建成功')
    showAdd.value = false
    createForm.value = { id: '', name: '', icon: '🧩', description: '', keywords: '', prompt: '' }
    await Promise.all([loadInstalled(), loadMarket()])
    activeTab.value = 'installed'
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '创建失败')
  } finally {
    creating.value = false
  }
}

function sourceTag(source: string) {
  if (source === 'file') return { text: '文件库', type: 'warning' as const }
  if (source === 'custom') return { text: '自定义', type: 'success' as const }
  return { text: '内置', type: 'info' as const }
}
</script>

<template>
  <div class="skills-page">
    <header class="page-head">
      <h1>技能</h1>
      <div class="head-actions">
        <el-input
          v-model="searchQuery"
          :prefix-icon="Search"
          placeholder="搜索技能"
          clearable
          class="search-box"
        />
        <el-button :icon="Refresh" :loading="reloading" @click="handleReload">重载</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd">添加技能</el-button>
      </div>
    </header>

    <el-tabs v-model="activeTab">
      <el-tab-pane :label="`商店 (${market.length})`" name="store" />
      <el-tab-pane :label="`已安装 (${skills.length})`" name="installed" />
    </el-tabs>

    <!-- ============ 商店 ============ -->
    <div v-if="activeTab === 'store'" v-loading="loading" class="store">
      <!-- 精选技能 -->
      <template v-if="!searchQuery && activeCategory === '全部'">
        <div class="section-title">精选技能</div>
        <div class="featured-row">
          <div v-for="s in featuredSkills" :key="s.id" class="featured-card">
            <span class="skill-icon">{{ s.icon }}</span>
            <div class="featured-info">
              <div class="featured-name">
                {{ s.name }}
                <el-tag size="small" :type="s.type === 'online' ? 'primary' : 'success'" effect="plain">
                  {{ s.type === 'online' ? '联网' : '离线' }}
                </el-tag>
              </div>
              <div class="skill-desc clamp2">{{ s.description }}</div>
              <div class="skill-meta">
                <span>⬇ {{ formatDownloads(s.downloads) }}</span>
                <el-button
                  size="small" type="primary" round
                  :loading="installingId === s.id" :disabled="s.installed"
                  @click="handleInstall(s)"
                >{{ s.installed ? '已安装' : '添加' }}</el-button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 分类页签 -->
      <div class="category-tabs">
        <button
          v-for="c in ['全部', ...categories]" :key="c"
          class="cat-tab" :class="{ active: activeCategory === c }"
          @click="activeCategory = c"
        >{{ c }}</button>
      </div>

      <!-- 技能卡片网格 -->
      <div class="card-grid">
        <div v-for="s in filteredMarket" :key="s.id" class="skill-card">
          <div class="card-head">
            <span class="card-icon">{{ s.icon }}</span>
            <div class="card-title">
              <div class="card-name">{{ s.name }}</div>
              <div class="card-meta">
                <span>⬇ {{ formatDownloads(s.downloads) }}</span>
                <span>v{{ s.version }}</span>
              </div>
            </div>
            <el-tag size="small" :type="s.type === 'online' ? 'primary' : 'success'" effect="plain">
              {{ s.type === 'online' ? '联网' : '离线' }}
            </el-tag>
          </div>
          <div class="skill-desc clamp2">{{ s.description }}</div>
          <div class="card-foot">
            <div class="card-tags">
              <el-tag v-for="t in s.allowedTools.slice(0, 2)" :key="t" size="small" effect="plain" type="warning">{{ t }}</el-tag>
            </div>
            <div class="card-actions">
              <template v-if="s.installed">
                <el-button size="small" text :icon="View" @click="openDetail(s.id)">详情</el-button>
                <el-button size="small" type="info" plain round disabled>已安装</el-button>
                <el-button size="small" text :icon="Delete" :loading="uninstallingId === s.id" @click="handleUninstall(s)" />
              </template>
              <el-button
                v-else size="small" type="primary" round
                :loading="installingId === s.id" @click="handleInstall(s)"
              >安装</el-button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!filteredMarket.length && !loading" class="empty-tip">没有匹配的技能，换个关键词试试</div>
    </div>

    <!-- ============ 已安装 ============ -->
    <div v-else class="skill-list" v-loading="loading">
      <div v-for="s in skills" :key="s.id" class="skill-item">
        <span class="skill-icon">{{ s.icon }}</span>
        <div class="skill-info">
          <div class="skill-name">
            {{ s.name }}
            <el-tag size="small" :type="sourceTag(s.source).type" effect="plain">{{ sourceTag(s.source).text }}</el-tag>
            <el-tag v-if="s.isActive" size="small" type="success" effect="light">当前启用</el-tag>
          </div>
          <div class="skill-desc">{{ s.description || '（无描述）' }}</div>
          <div v-if="s.triggerKeywords?.length" class="card-tags">
            <el-tag v-for="k in s.triggerKeywords.slice(0, 6)" :key="k" size="small" effect="plain" class="kw">{{ k }}</el-tag>
          </div>
        </div>
        <div class="skill-actions">
          <el-button size="small" :icon="View" @click="openDetail(s.id)">详情</el-button>
          <el-button size="small" type="primary" plain :icon="CircleCheck" :disabled="s.isActive" @click="handleSwitch(s.id)">启用</el-button>
          <el-button
            v-if="s.source === 'file'"
            size="small" type="danger" plain :icon="Delete"
            :loading="uninstallingId === s.id"
            @click="handleUninstall(s)"
          >卸载</el-button>
        </div>
      </div>
      <div v-if="!skills.length && !loading" class="empty-tip">还没有任何技能，去商店安装一个吧</div>
    </div>

    <!-- ============ 添加技能弹窗 ============ -->
    <el-dialog v-model="showAdd" title="添加技能" width="640px" destroy-on-close>
      <el-tabs v-model="addMode">
        <el-tab-pane label="创建技能" name="create">
          <div class="add-form">
            <div class="form-row">
              <el-input v-model="createForm.id" placeholder="技能 id（如 my-skill）" style="flex: 1" />
              <el-input v-model="createForm.name" placeholder="技能名称" style="flex: 1" />
              <el-input v-model="createForm.icon" placeholder="图标 emoji" style="width: 110px" />
            </div>
            <el-input v-model="createForm.description" placeholder="技能描述（一句话说明它能做什么）" />
            <el-input v-model="createForm.keywords" placeholder="触发关键词，逗号分隔（用于消息自动匹配）" />
            <el-input
              v-model="createForm.prompt" type="textarea" :rows="8"
              placeholder="技能提示词（写入 SKILL.md 正文，定义角色与工作方式）"
            />
          </div>
        </el-tab-pane>
        <el-tab-pane label="上传 SKILL.md" name="upload">
          <div class="upload-panel">
            <div class="upload-drop" @click="uploadRef?.click()">
              <el-icon :size="28"><UploadFilled /></el-icon>
              <div v-if="uploadFileName" class="upload-file">{{ uploadFileName }}</div>
              <div v-else class="upload-hint">点击选择 SKILL.md 文件（服务端自动解析 frontmatter）</div>
            </div>
            <input ref="uploadRef" type="file" accept=".md,text/markdown" style="display: none" @change="onUploadFile" />
            <el-alert type="info" :closable="false" show-icon
              title="SKILL.md 需包含 --- 包裹的 frontmatter：id / name / description / icon / version / triggerKeywords / allowedTools" />
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="router.push('/chat')">返回对话</el-button>
        <el-button v-if="addMode === 'create'" type="primary" :icon="EditPen" :loading="creating" @click="handleCreate">创建技能</el-button>
        <el-button v-else type="primary" :icon="UploadFilled" :loading="uploading" @click="handleUpload">上传并安装</el-button>
      </template>
    </el-dialog>

    <SkillDetailDialog v-model="showDetail" :skill-id="detailSkillId" />
  </div>
</template>

<style scoped>
.skills-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px;
}
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}
.page-head h1 {
  margin: 0;
  font-size: 22px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.search-box {
  width: 220px;
}
.section-title {
  margin: 4px 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
/* 精选横排 */
.featured-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.featured-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-secondary);
}
.featured-info {
  flex: 1;
  min-width: 0;
}
.featured-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
/* 分类页签 */
.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.cat-tab {
  padding: 5px 14px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.cat-tab:hover {
  color: var(--primary);
  border-color: var(--primary);
}
.cat-tab.active {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-light);
  font-weight: 600;
}
/* 卡片网格 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
}
.skill-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-secondary);
  transition: box-shadow 0.15s, border-color 0.15s;
}
.skill-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.card-icon {
  font-size: 26px;
  line-height: 1;
}
.card-title {
  flex: 1;
  min-width: 0;
}
.card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}
.skill-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.clamp2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.kw { font-size: 11px; }
.card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
/* 已安装列表 */
.skill-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 200px;
}
.skill-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-secondary);
}
.skill-icon { font-size: 26px; line-height: 1; margin-top: 2px; }
.skill-info { flex: 1; min-width: 0; }
.skill-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.skill-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.empty-tip {
  padding: 40px 0;
  text-align: center;
  color: var(--text-secondary);
}
/* 添加技能弹窗 */
.add-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.form-row { display: flex; gap: 10px; }
.upload-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.upload-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 16px;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s;
}
.upload-drop:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-light);
}
.upload-file { font-size: 13px; color: var(--primary); font-weight: 600; }
.upload-hint { font-size: 12px; }
@media (max-width: 768px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .skill-item { flex-direction: column; }
}
</style>
