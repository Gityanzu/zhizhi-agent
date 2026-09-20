<template>
  <div class="page-layout">
    <Sidebar />
    <div class="page-content">
      <!-- 顶部导航栏 -->
      <header class="page-header">
        <div class="header-left">
          <el-button @click="$router.push('/chat')">
            <el-icon><ArrowLeft /></el-icon>
            返回聊天
          </el-button>
          <h1 class="page-title">数据分析</h1>
        </div>
        <p class="page-desc">查看 Agent 市场的统计数据和分析报告</p>
      </header>
      
      <!-- 场景切换区 -->
      <div class="scenario-section">
        <ScenarioSelector
          :active-scenario="activeScenario"
          @change="handleScenarioChange"
          @select-agent="handleSelectAgent"
        />
      </div>
      
      <!-- 页面主体内容 -->
      <div class="page-body">
        <div v-if="loading" class="loading">
          <div class="spinner"></div>
          <p>加载中...</p>
        </div>

        <div v-else-if="summary" class="analytics-content">
          <!-- 汇总卡片 -->
          <div class="summary-section">
            <h2 class="section-title">数据汇总</h2>
            <div class="summary-cards">
              <div class="summary-card">
                <div class="card-icon">👥</div>
                <div class="card-content">
                  <div class="card-value">{{ summary.totalAgents }}</div>
                  <div class="card-label">Agent 总数</div>
                </div>
              </div>
              <div class="summary-card">
                <div class="card-icon">👁️</div>
                <div class="card-content">
                  <div class="card-value">{{ (summary.totalViews || 0).toLocaleString() }}</div>
                  <div class="card-label">总浏览次数</div>
                </div>
              </div>
              <div class="summary-card">
                <div class="card-icon">⭐</div>
                <div class="card-content">
                  <div class="card-value">{{ (summary.totalRatings || 0).toLocaleString() }}</div>
                  <div class="card-label">总评分数</div>
                </div>
              </div>
              <div class="summary-card">
                <div class="card-icon">📊</div>
                <div class="card-content">
                  <div class="card-value">{{ (summary.averageRating || 0).toFixed(1) }}</div>
                  <div class="card-label">平均评分</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 最受欢迎的 Agent -->
          <div class="popular-section">
            <h2 class="section-title">最受欢迎的 Agent</h2>
            <div v-if="summary?.mostPopularAgent" class="popular-card">
              <div class="popular-header">
                <div class="popular-avatar">
                  <div class="avatar-placeholder-large">
                    {{ summary.mostPopularAgent.name.charAt(0) }}
                  </div>
                </div>
                <div class="popular-info">
                  <h3>{{ summary.mostPopularAgent.name }}</h3>
                  <p>综合得分：{{ summary.mostPopularAgent.popularityScore.toFixed(1) }}</p>
                </div>
              </div>
              <div class="popular-stats">
                <div class="stat-item">
                  <span class="stat-label">评分</span>
                  <span class="stat-value">{{ summary.mostPopularAgent.rating }}⭐</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">浏览</span>
                  <span class="stat-value">{{ summary.mostPopularAgent.viewCount }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">模板</span>
                  <span class="stat-value">{{ summary.mostPopularAgent.templateCount }}</span>
                </div>
              </div>
            </div>
            <div v-else class="no-data">暂无数据</div>
          </div>

          <!-- 分类统计 -->
          <div class="categories-section">
            <h2 class="section-title">分类统计</h2>
            <div class="categories-list">
              <div
                v-for="(category, index) in summary.topCategories"
                :key="category.name"
                class="category-item"
              >
                <div class="category-rank">{{ index + 1 }}</div>
                <div class="category-name">{{ category.name }}</div>
                <div class="category-count">{{ category.count }} 个</div>
              </div>
            </div>
          </div>

          <!-- 标签统计 -->
          <div class="tags-section">
            <h2 class="section-title">热门标签</h2>
            <div class="tags-cloud">
              <span
                v-for="(tag, index) in summary.topTags"
                :key="tag.name"
                class="tag-item"
                :style="{ fontSize: `${12 + (index * 2)}px` }"
              >
                {{ tag.name }}
                <span class="tag-count">({{ tag.count }})</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Sidebar from '@/components/common/Sidebar.vue'
import ScenarioSelector from '@/components/common/ScenarioSelector.vue'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getAnalyticsSummary, type AnalyticsSummary } from '@/api/agentAnalytics'

const router = useRouter()
const loading = ref(false)
const summary = ref<AnalyticsSummary | null>(null)
const activeScenario = ref('office')

onMounted(async () => {
  await loadSummary()
})

const loadSummary = async () => {
  loading.value = true
  try {
    summary.value = await getAnalyticsSummary()
  } catch (error) {
    console.error('加载统计汇总失败:', error)
  } finally {
    loading.value = false
  }
}

function handleScenarioChange(scenarioId: string) {
  console.log('场景切换:', scenarioId)
}

function handleSelectAgent(agentId: string) {
  console.log('选择 Agent:', agentId)
}
</script>

<style scoped>
.page-layout {
  display: flex;
  height: 100vh;
}

.page-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  background: var(--bg-primary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 场景切换区 */
.scenario-section {
  padding: 16px 24px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}

.page-body {
  flex: 1;
  overflow: auto;
  padding: 20px 24px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e0e0e0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.analytics-content {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.section-title {
  margin: 0 0 20px;
  font-size: 24px;
  color: #333;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 10px;
}

.summary-section {
  padding: 30px;
  background: white;
  border-radius: 12px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
  transition: transform 0.3s;
}

.summary-card:hover {
  transform: translateY(-4px);
}

.card-icon {
  font-size: 48px;
}

.card-content {
  flex: 1;
}

.card-value {
  font-size: 36px;
  font-weight: 700;
}

.card-label {
  font-size: 14px;
  opacity: 0.9;
}

.popular-section,
.categories-section,
.tags-section {
  padding: 30px;
  background: white;
  border-radius: 12px;
}

.popular-card,
.category-item,
.tag-item {
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.popular-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.popular-header {
  display: flex;
  align-items: center;
  gap: 20px;
}

.popular-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-placeholder-large {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 36px;
  font-weight: bold;
}

.popular-info h3 {
  margin: 0 0 5px;
  font-size: 20px;
  color: #333;
}

.popular-info p {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.popular-stats {
  display: flex;
  gap: 20px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: #999;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.categories-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.category-rank {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.category-name {
  flex: 1;
  font-size: 16px;
  color: #333;
}

.category-count {
  font-size: 14px;
  color: #666;
}

.tags-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.tag-item {
  padding: 8px 16px;
  background: #f3f4f6;
  border-radius: 20px;
  color: #333;
  transition: all 0.3s;
}

.tag-item:hover {
  background: #e5e7eb;
  transform: scale(1.05);
}

.tag-count {
  margin-left: 8px;
  font-size: 12px;
  color: #999;
}

.no-data {
  text-align: center;
  padding: 40px;
  color: #999;
}
</style>
