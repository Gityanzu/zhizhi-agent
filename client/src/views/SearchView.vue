<template>
  <div class="search-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <h1>Agent 市场</h1>
      <p>发现、使用和分享强大的 AI Agent</p>
    </div>

    <!-- 搜索区域 -->
    <div class="search-section">
      <SearchInput
        v-model="searchQuery"
        placeholder="搜索你想要的 Agent..."
        @search="handleSearch"
      />
    </div>

    <!-- 搜索过滤器 -->
    <div v-if="showFilters" class="search-filters">
      <el-card>
        <div class="filter-header">
          <span>筛选条件</span>
          <el-button text @click="clearFilters">
            清空筛选
          </el-button>
        </div>

        <div class="filter-content">
          <!-- 分类筛选 -->
          <div class="filter-group">
            <label>分类</label>
            <el-select
              v-model="filters.category"
              placeholder="选择分类"
              clearable
              @change="handleFilterChange"
            >
              <el-option
                v-for="category in facetCategories"
                :key="category.value"
                :label="category.label"
                :value="category.value"
              >
                <div class="category-option">
                  <span>{{ category.label }}</span>
                  <span class="count">({{ category.count }})</span>
                </div>
              </el-option>
            </el-select>
          </div>

          <!-- 模型筛选 -->
          <div class="filter-group">
            <label>模型</label>
            <el-select
              v-model="filters.model"
              placeholder="选择模型"
              clearable
              @change="handleFilterChange"
            >
              <el-option
                v-for="model in facetModels"
                :key="model.value"
                :label="model.label"
                :value="model.value"
              >
                <div class="model-option">
                  <span>{{ model.label }}</span>
                  <span class="count">({{ model.count }})</span>
                </div>
              </el-option>
            </el-select>
          </div>

          <!-- 评分筛选 -->
          <div class="filter-group">
            <label>评分</label>
            <el-select
              v-model="filters.rating"
              placeholder="选择评分"
              clearable
              @change="handleFilterChange"
            >
              <el-option label="5星" value="5" />
              <el-option label="4星以上" value="4" />
              <el-option label="3星以上" value="3" />
              <el-option label="2星以上" value="2" />
              <el-option label="1星以上" value="1" />
            </el-select>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 搜索结果 -->
    <div class="results-section">
      <SearchResults
        :results="searchResults"
        :search-query="searchQuery"
        :loading="loading"
        @page-change="handlePageChange"
        @sort-change="handleSortChange"
        @select-agent="handleSelectAgent"
      />
    </div>

    <!-- 搜索历史侧边栏 -->
    <div v-if="showHistory" class="history-sidebar">
      <el-card class="history-card">
        <template #header>
          <div class="card-header">
            <span>搜索历史</span>
            <el-button text @click="clearHistory">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </template>

        <div v-if="searchHistory.length > 0" class="history-list">
          <div
            v-for="item in searchHistory"
            :key="item.id"
            class="history-item"
            @click="selectHistory(item)"
          >
            <el-icon><Clock /></el-icon>
            <span>{{ item.query }}</span>
            <span class="time">{{ formatTime(item.createdAt) }}</span>
          </div>
        </div>

        <el-empty v-else description="暂无搜索历史" />
      </el-card>

      <!-- 热门搜索 -->
      <el-card class="popular-card">
        <template #header>
          <div class="card-header">
            <span>热门搜索</span>
            <el-tooltip content="查看趋势" placement="top">
              <el-icon><TrendCharts /></el-icon>
            </el-tooltip>
          </div>
        </template>

        <div class="popular-list">
          <div
            v-for="item in popularSearches"
            :key="item.query"
            class="popular-item"
            @click="selectPopular(item)"
          >
            <span class="rank">{{ popularSearches.indexOf(item) + 1 }}</span>
            <span class="query">{{ item.query }}</span>
            <span class="trend">
              {{ getTrendIcon(item.trend) }} {{ item.count }}
            </span>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Clock, TrendCharts } from '@element-plus/icons-vue'
import SearchInput from '@/components/search/SearchInput.vue'
import SearchResults from '@/components/search/SearchResults.vue'
import { searchAgents, getSearchStats, getUserSearchHistory, getPopularSearches, SearchParams, SearchResponse, SearchHistory, PopularSearch, SearchFacets } from '@/api/search'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// 搜索状态
const searchQuery = ref('')
const loading = ref(false)
const searchResults = ref<SearchResponse>({
  agents: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 0,
  searchTime: 0,
  query: '',
})

// 筛选状态
const filters = ref({
  category: '',
  model: '',
  rating: '',
})

// 分面聚合数据
const facetCategories = ref<SearchFacets['categories']>([])
const facetModels = ref<SearchFacets['models']>([])

// 侧边栏状态
const showFilters = ref(false)
const showHistory = ref(false)
const searchHistory = ref<SearchHistory[]>([])
const popularSearches = ref<PopularSearch[]>([])

// 从 URL 参数初始化搜索
watch(() => route.query, (query) => {
  if (query.q) {
    searchQuery.value = query.q as string
  }
  if (query.category) {
    filters.value.category = query.category as string
  }
  if (query.model) {
    filters.value.model = query.model as string
  }
  if (query.sortBy) {
    sortBy.value = query.sortBy as string
  }
  if (query.sortOrder) {
    sortOrder.value = query.sortOrder as string
  }
  if (query.page) {
    currentPage.value = parseInt(query.page as string)
  }
  if (query.pageSize) {
    pageSize.value = parseInt(query.pageSize as string)
  }

  // 初始搜索
  if (query.q || Object.keys(query).length > 0) {
    performSearch()
  }
}, { immediate: true })

// 监听搜索词变化
watch(searchQuery, (newQuery) => {
  if (newQuery && route.path === '/search') {
    router.push({
      path: '/search',
      query: { ...route.query, q: newQuery, page: 1 }
    })
  }
})

// 执行搜索
const performSearch = async () => {
  if (!searchQuery.value && !filters.value.category && !filters.value.model) {
    searchResults.value = {
      agents: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
      searchTime: 0,
      query: '',
    }
    return
  }

  loading.value = true

  try {
    const params: SearchParams = {
      query: searchQuery.value,
      category: filters.value.category,
      model: filters.value.model,
      rating: filters.value.rating ? parseInt(filters.value.rating) : undefined,
      sortBy: sortBy.value as SearchParams['sortBy'],
      sortOrder: sortOrder.value as SearchParams['sortOrder'],
      page: currentPage.value,
      pageSize: pageSize.value,
    }

    const results = await searchAgents(params)
    searchResults.value = results

    // 更新分面数据
    if (results.facets) {
      facetCategories.value = results.facets.categories
      facetModels.value = results.facets.models
    }

    // 记录搜索历史
    if (authStore.isAuthenticated && searchQuery.value) {
      await addToSearchHistory(searchQuery.value)
    }
  } catch (error) {
    console.error('搜索失败:', error)
    ElMessage.error('搜索失败，请重试')
  } finally {
    loading.value = false
  }
}

// 处理搜索
const handleSearch = (query: string) => {
  searchQuery.value = query
  currentPage.value = 1
  performSearch()
}

// 处理筛选变化
const handleFilterChange = () => {
  currentPage.value = 1
  performSearch()
}

// 清空筛选
const clearFilters = () => {
  filters.value = {
    category: '',
    model: '',
    rating: '',
  }
  currentPage.value = 1
  performSearch()
}

// 处理分页
const currentPage = ref(1)
const pageSize = ref(10)

const handlePageChange = (page: number, size: number) => {
  currentPage.value = page
  pageSize.value = size
  performSearch()

  // 更新 URL
  router.push({
    path: '/search',
    query: {
      ...route.query,
      page,
      pageSize: size,
    }
  })
}

// 处理排序
const sortBy = ref('relevance')
const sortOrder = ref('desc')

const handleSortChange = (sortBy: string, sortOrder: string) => {
  sortBy.value = sortBy
  sortOrder.value = sortOrder
  currentPage.value = 1
  performSearch()

  // 更新 URL
  router.push({
    path: '/search',
    query: {
      ...route.query,
      sortBy,
      sortOrder,
      page: 1,
    }
  })
}

// 选择历史
const selectHistory = (item: SearchHistory) => {
  searchQuery.value = item.query
  handleSearch(item.query)
}

// 选择热门搜索
const selectPopular = (item: PopularSearch) => {
  searchQuery.value = item.query
  handleSearch(item.query)
}

// 清空历史
const clearHistory = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有搜索历史吗？', '提示', {
      type: 'warning',
    })

    // 这里应该调用 API 清空历史，为了演示先清空本地
    searchHistory.value = []
    ElMessage.success('搜索历史已清空')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

// 添加到搜索历史
const addToSearchHistory = async (query: string) => {
  if (!authStore.isAuthenticated) return

  try {
    // 模拟添加历史，实际应该调用 API
    const newHistory: SearchHistory = {
      id: Date.now().toString(),
      query,
      resultsCount: searchResults.value.total,
      createdAt: new Date().toISOString(),
    }

    // 避免重复
    const exists = searchHistory.value.some(item => item.query === query)
    if (!exists) {
      searchHistory.value.unshift(newHistory)
      // 只保留最近20条
      if (searchHistory.value.length > 20) {
        searchHistory.value = searchHistory.value.slice(0, 20)
      }
    }
  } catch (error) {
    console.error('添加搜索历史失败:', error)
  }
}

// 获取趋势图标
const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
  switch (trend) {
    case 'up':
      return '↗'
    case 'down':
      return '↘'
    case 'stable':
      return '→'
    default:
      return ''
  }
}

// 格式化时间
const formatTime = (time: string) => {
  const date = new Date(time)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) {
    return '刚刚'
  } else if (diff < 3600000) {
    return Math.floor(diff / 60000) + '分钟前'
  } else if (diff < 86400000) {
    return Math.floor(diff / 3600000) + '小时前'
  } else {
    return date.toLocaleDateString()
  }
}

// 选择 Agent
const handleSelectAgent = (agent: any) => {
  router.push(`/agent/${agent.id}`)
}

// 加载初始数据
onMounted(async () => {
  // 加载热门搜索
  try {
    const popular = await getPopularSearches()
    popularSearches.value = popular
  } catch (error) {
    console.error('加载热门搜索失败:', error)
  }

  // 加载用户搜索历史
  if (authStore.isAuthenticated) {
    try {
      const history = await getUserSearchHistory()
      searchHistory.value = history
    } catch (error) {
      console.error('加载搜索历史失败:', error)
    }
  }

  // 监听窗口大小变化控制侧边栏显示
  const checkLayout = () => {
    showHistory.value = window.innerWidth > 1200
    showFilters.value = window.innerWidth > 768
  }

  checkLayout()
  window.addEventListener('resize', checkLayout)
})
</script>

<style scoped lang="scss">
.search-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 40px;

  h1 {
    font-size: 36px;
    margin-bottom: 12px;
    color: var(--text-primary);
  }

  p {
    font-size: 18px;
    color: var(--text-secondary);
  }
}

.search-section {
  margin-bottom: 30px;
}

.search-filters {
  margin-bottom: 30px;

  .filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .filter-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  .filter-group {
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      color: var(--text-secondary);
    }
  }

  .category-option,
  .model-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .count {
      color: var(--text-secondary);
      font-size: 12px;
    }
  }
}

.results-section {
  margin-bottom: 30px;
}

.history-sidebar {
  position: sticky;
  top: 20px;
  height: fit-content;
  display: flex;
  flex-direction: column;
  gap: 20px;

  .history-card,
  .popular-card {
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .history-list,
    .popular-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .history-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: var(--bg-hover);
      }

      .time {
        margin-left: auto;
        font-size: 12px;
        color: var(--text-secondary);
      }
    }

    .popular-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: var(--bg-hover);
      }

      .rank {
        width: 20px;
        height: 20px;
        background: var(--primary-color);
        color: white;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 500;
      }

      .trend {
        margin-left: auto;
        font-size: 12px;
        color: var(--text-secondary);
      }
    }
  }
}

// 响应式设计
@media (max-width: 1200px) {
  .history-sidebar {
    display: none;
  }
}

@media (max-width: 768px) {
  .search-filters {
    display: none;
  }

  .page-header {
    h1 {
      font-size: 28px;
    }

    p {
      font-size: 16px;
    }
  }
}
</style>