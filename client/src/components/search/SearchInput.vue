<template>
  <div class="search-input">
    <el-autocomplete
      v-model="searchQuery"
      :fetch-suggestions="fetchSuggestions"
      placeholder="搜索 Agent..."
      :trigger-on-focus="false"
      select-when-unmatched
      clearable
      @select="handleSelect"
      @keyup.enter="handleSearch"
    >
      <template #suffix>
        <el-button
          type="primary"
          :loading="loading"
          @click="handleSearch"
        >
          <el-icon><Search /></el-icon>
        </el-button>
      </template>
    </el-autocomplete>

    <!-- 搜索历史 -->
    <div v-if="showHistory && searchHistory.length > 0" class="search-history">
      <div class="history-header">
        <span>搜索历史</span>
        <el-button text type="small" @click="clearHistory">
          <el-icon><Delete /></el-icon>
          清空
        </el-button>
      </div>
      <div class="history-items">
        <div
          v-for="item in searchHistory"
          :key="item.id"
          class="history-item"
          @click="selectHistory(item)"
        >
          <el-icon><Clock /></el-icon>
          {{ item.query }}
          <span class="results-count">({{ item.resultsCount }})</span>
        </div>
      </div>
    </div>

    <!-- 热门搜索 -->
    <div v-if="!searchQuery && popularSearches.length > 0" class="popular-searches">
      <div class="popular-header">
        <span>热门搜索</span>
        <el-tooltip content="点击查看趋势" placement="top">
          <el-icon><TrendCharts /></el-icon>
        </el-tooltip>
      </div>
      <div class="popular-tags">
        <el-tag
          v-for="item in popularSearches"
          :key="item.query"
          type="primary"
          effect="plain"
          class="popular-tag"
          @click="selectPopular(item)"
        >
          {{ item.query }}
          <span class="trend">
            {{ getTrendIcon(item.trend) }} {{ item.count }}
          </span>
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Delete, Clock, TrendCharts } from '@element-plus/icons-vue'
import { api } from '@/api/request'
import { getSearchSuggestions, getPopularSearches, getUserSearchHistory, clearSearchHistory, SearchSuggestion, PopularSearch } from '@/api/search'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const props = defineProps<{
  modelValue: string
  placeholder?: string
  showHistory?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'search', query: string): void
}>()

const searchQuery = ref(props.modelValue)
const loading = ref(false)
const suggestions = ref<SearchSuggestion[]>([])
const popularSearches = ref<PopularSearch[]>([])
const searchHistory = ref<SearchHistory[]>([])

// 监听外部更新
watch(() => props.modelValue, (newVal) => {
  searchQuery.value = newVal
})

// 获取搜索建议
const fetchSuggestions = async (queryString: string, cb: (suggestions: SearchSuggestion[]) => void) => {
  if (!queryString.trim()) {
    cb([])
    return
  }

  try {
    loading.value = true
    const result = await getSearchSuggestions(queryString)
    cb(result)
  } catch (error) {
    console.error('获取搜索建议失败:', error)
    cb([])
  } finally {
    loading.value = false
  }
}

// 执行搜索
const handleSearch = () => {
  const query = searchQuery.value.trim()
  if (!query) {
    ElMessage.warning('请输入搜索内容')
    return
  }

  // 更新输入值
  emit('update:modelValue', query)
  // 触发搜索事件
  emit('search', query)

  // 添加到搜索历史（需要登录）
  if (authStore.isAuthenticated) {
    addSearchToHistory(query)
  }
}

// 选择建议
const handleSelect = (suggestion: SearchSuggestion) => {
  searchQuery.value = suggestion.text
  emit('update:modelValue', suggestion.text)
  handleSearch()
}

// 选择热门搜索
const selectPopular = (item: PopularSearch) => {
  searchQuery.value = item.query
  emit('update:modelValue', item.query)
  handleSearch()
}

// 选择搜索历史
const selectHistory = (item: SearchHistory) => {
  searchQuery.value = item.query
  emit('update:modelValue', item.query)
  handleSearch()
}

// 清空历史
const clearHistory = async () => {
  if (!authStore.isAuthenticated) {
    ElMessage.warning('请先登录')
    return
  }

  try {
    await clearSearchHistory()
    searchHistory.value = []
    ElMessage.success('搜索历史已清空')
  } catch (error) {
    console.error('清空历史失败:', error)
    ElMessage.error('清空失败')
  }
}

// 添加到搜索历史
const addSearchToHistory = async (query: string) => {
  if (!authStore.isAuthenticated) return

  try {
    // 这里应该调用后端API添加历史，为了演示我们先模拟
    // await addToSearchHistory(query)

    // 更新本地历史
    if (!searchHistory.value.some(item => item.query === query)) {
      searchHistory.value.unshift({
        id: Date.now().toString(),
        query,
        resultsCount: 0, // 实际中应该从搜索结果获取
        createdAt: new Date().toISOString(),
      })

      // 只保留最近10条
      if (searchHistory.value.length > 10) {
        searchHistory.value = searchHistory.value.slice(0, 10)
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

// 组件挂载时加载数据
onMounted(async () => {
  try {
    // 加载热门搜索
    const popular = await getPopularSearches()
    popularSearches.value = popular
  } catch (error) {
    console.error('加载热门搜索失败:', error)
  }

  // 如果用户已登录，加载搜索历史
  if (authStore.isAuthenticated) {
    try {
      const history = await getUserSearchHistory()
      searchHistory.value = history
    } catch (error) {
      console.error('加载搜索历史失败:', error)
    }
  }
})
</script>

<style scoped lang="scss">
.search-input {
  position: relative;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;

  .el-autocomplete {
    width: 100%;
  }
}

.search-history,
.popular-searches {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  margin-top: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  z-index: 1000;
  max-height: 300px;
  overflow-y: auto;
}

.history-header,
.popular-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #ebeef5;
  font-size: 12px;
  color: #606266;
}

.history-items,
.popular-tags {
  padding: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  color: #303133;

  &:hover {
    background: #f5f7fa;
  }

  .el-icon {
    margin-right: 8px;
    color: #909399;
  }

  .results-count {
    margin-left: auto;
    color: #909399;
    font-size: 12px;
  }
}

.popular-tag {
  margin: 4px;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .trend {
    margin-left: 4px;
    font-size: 12px;
    color: #909399;
  }
}
</style>