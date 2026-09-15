<template>
  <div class="search-results">
    <!-- 搜索统计信息 -->
    <div v-if="results.total > 0" class="search-stats">
      <div class="stats-info">
        <span class="results-count">找到 {{ results.total }} 个结果</span>
        <span class="search-time">搜索耗时: {{ formatSearchTime(results.searchTime) }}</span>
      </div>

      <!-- 排序选项 -->
      <div class="sort-options">
        <el-select v-model="sortBy" @change="handleSortChange" size="small">
          <el-option
            v-for="option in sortOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-select v-model="sortOrder" @change="handleSortChange" size="small">
          <el-option label="降序" value="desc" />
          <el-option label="升序" value="asc" />
        </el-select>
      </div>
    </div>

    <!-- 无结果提示 -->
    <el-empty
      v-if="results.total === 0 && !loading"
      description="未找到相关 Agent"
    >
      <template #image>
        <el-icon size="64"><Search /></el-icon>
      </template>
      <template #default>
        <div class="empty-tips">
          <p>试试调整搜索关键词</p>
          <div class="search-tips">
            <el-tag
              v-for="tip in searchTips"
              :key="tip"
              size="small"
              effect="plain"
              @click="useTip(tip)"
            >
              {{ tip }}
            </el-tag>
          </div>
        </div>
      </template>
    </el-empty>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="3" animated />
    </div>

    <!-- 搜索结果列表 -->
    <div v-if="results.agents.length > 0" class="agents-grid">
      <div
        v-for="agent in results.agents"
        :key="agent.id"
        class="agent-card"
        @click="selectAgent(agent)"
      >
        <div class="agent-header">
          <div class="avatar">{{ agent.avatar }}</div>
          <div class="agent-info">
            <h3 class="agent-name">{{ agent.name }}</h3>
            <div class="meta-info">
              <el-tag size="small" type="info">{{ agent.category }}</el-tag>
              <span class="model">{{ agent.model }}</span>
              <span class="rating" v-if="agent.rating">
                <el-rate
                  v-model="agent.rating"
                  disabled
                  text-color="#ff9900"
                  show-score
                  :max="5"
                  :low-threshold="1"
                  :high-threshold="4"
                  :scores="[1, 2, 3, 4, 5]"
                />
                <span class="rating-count">({{ agent.rating.toFixed(1) }})</span>
              </span>
            </div>
          </div>
        </div>

        <div class="agent-content">
          <p class="description">{{ agent.description }}</p>

          <!-- 高亮片段 -->
          <div v-if="agent.highlights && agent.highlights.length > 0" class="highlights">
            <div class="highlight-title">相关片段:</div>
            <div class="highlight-items">
              <span
                v-for="(highlight, index) in agent.highlights"
                :key="index"
                class="highlight-item"
                v-html="highlightText(highlight, searchQuery)"
              />
            </div>
          </div>

          <!-- 标签 -->
          <div v-if="agent.tools && agent.tools.length > 0" class="tags">
            <el-tag
              v-for="tool in agent.tools.slice(0, 3)"
              :key="tool"
              size="small"
              effect="plain"
            >
              {{ tool }}
            </el-tag>
            <span v-if="agent.tools.length > 3" class="more-tags">
              +{{ agent.tools.length - 3 }}
            </span>
          </div>

          <!-- 统计信息 -->
          <div class="stats">
            <span class="stat-item">
              <el-icon><ChatLineSquare /></el-icon>
              {{ agent.commentCount || 0 }}
            </span>
            <span class="stat-item">
              <el-icon><View /></el-icon>
              {{ formatNumber(agent.viewCount || 0) }}
            </span>
            <span class="stat-item">
              <el-icon><Download /></el-icon>
              {{ formatNumber(agent.downloadCount || 0) }}
            </span>
          </div>
        </div>

        <!-- 相关度分数 -->
        <div class="relevance-score">
          相关度: {{ (agent.score * 10).toFixed(1) }}%
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="results.totalPages > 1" class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="results.total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, ChatLineSquare, View, Download } from '@element-plus/icons-vue'
import { SearchResponse, SearchResult } from '@/types/search'
import { formatSearchTime, getSortLabel } from '@/api/search'
import { useAgentStore } from '@/stores/agent'

const props = defineProps<{
  results: SearchResponse
  searchQuery: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'page-change', page: number, pageSize: number): void
  (e: 'sort-change', sortBy: string, sortOrder: string): void
  (e: 'select-agent', agent: SearchResult): void
}>()

const router = useRouter()
const agentStore = useAgentStore()

// 排序选项
const sortOptions = [
  { value: 'relevance', label: '相关度' },
  { value: 'rating', label: '评分' },
  { value: 'comments', label: '评论数' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'updatedAt', label: '更新时间' },
]

// 分页状态
const currentPage = ref(props.results.page)
const pageSize = ref(props.results.pageSize)
const sortBy = ref('relevance')
const sortOrder = ref('desc')

// 搜索提示
const searchTips = [
  '代码助手',
  '写作',
  '数据分析',
  '翻译',
  '创意',
  '学习',
  '办公',
  '编程',
]

// 监听外部结果更新
watch(() => props.results, (newResults) => {
  currentPage.value = newResults.page
  pageSize.value = newResults.pageSize
}, { deep: true })

// 处理排序变化
const handleSortChange = () => {
  emit('sort-change', sortBy.value, sortOrder.value)
}

// 处理页码变化
const handlePageChange = (page: number) => {
  emit('page-change', page, pageSize.value)
}

// 处理每页数量变化
const handleSizeChange = (size: number) => {
  emit('page-change', currentPage.value, size)
}

// 选择 Agent
const selectAgent = (agent: SearchResult) => {
  // 选中 Agent
  agentStore.setSelectedAgent(agent)

  // 跳转到 Agent 详情页
  router.push(`/agent/${agent.id}`)
}

// 使用搜索提示
const useTip = (tip: string) => {
  router.push({
    path: '/search',
    query: { q: tip }
  })
}

// 高亮搜索关键词
const highlightText = (text: string, query: string): string => {
  if (!query) return text

  const regex = new RegExp(`(${query})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

// 格式化数字
const formatNumber = (num: number): string => {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k'
  }
  return num.toString()
}

// 组件挂载时加载排序数据
onMounted(() => {
  // 可以从 URL 参数中恢复排序状态
  const urlParams = new URLSearchParams(window.location.search)
  const sortByParam = urlParams.get('sortBy')
  const sortOrderParam = urlParams.get('sortOrder')

  if (sortByParam && sortOptions.some(opt => opt.value === sortByParam)) {
    sortBy.value = sortByParam
  }
  if (sortOrderParam && ['asc', 'desc'].includes(sortOrderParam)) {
    sortOrder.value = sortOrderParam
  }
})
</script>

<style scoped lang="scss">
.search-results {
  width: 100%;
}

.search-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-card);
  border-radius: 8px;

  .stats-info {
    display: flex;
    gap: 20px;
    align-items: center;

    .results-count {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .search-time {
      font-size: 14px;
      color: var(--text-secondary);
    }
  }

  .sort-options {
    display: flex;
    gap: 8px;
  }
}

.empty-tips {
  text-align: center;
  margin-top: 20px;

  p {
    color: var(--text-secondary);
    margin-bottom: 16px;
  }

  .search-tips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
}

.loading-state {
  padding: 20px;
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.agent-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid var(--border-color);
  position: relative;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    border-color: var(--primary-color);
  }

  .agent-header {
    display: flex;
    align-items: flex-start;
    margin-bottom: 16px;

    .avatar {
      width: 48px;
      height: 48px;
      font-size: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--primary-color);
      color: white;
      border-radius: 8px;
      margin-right: 12px;
      flex-shrink: 0;
    }

    .agent-info {
      flex: 1;

      .agent-name {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .meta-info {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;

        .model {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .rating {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .rating-count {
          font-size: 12px;
          color: var(--text-secondary);
        }
      }
    }
  }

  .agent-content {
    .description {
      margin: 0 0 12px 0;
      color: var(--text-secondary);
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .highlights {
      margin-bottom: 12px;

      .highlight-title {
        font-size: 12px;
        color: var(--text-secondary);
        margin-bottom: 4px;
      }

      .highlight-items {
        display: flex;
        flex-direction: column;
        gap: 4px;

        .highlight-item {
          font-size: 12px;
          color: var(--text-primary);
          background: var(--bg-highlight);
          padding: 4px 8px;
          border-radius: 4px;
        }
      }
    }

    .tags {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 12px;
      flex-wrap: wrap;

      .more-tags {
        font-size: 12px;
        color: var(--text-secondary);
      }
    }

    .stats {
      display: flex;
      gap: 16px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border-color);

      .stat-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--text-secondary);

        .el-icon {
          font-size: 14px;
        }
      }
    }
  }

  .relevance-score {
    position: absolute;
    top: 16px;
    right: 16px;
    background: var(--primary-color);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 30px;
}

// 响应式设计
@media (max-width: 768px) {
  .agents-grid {
    grid-template-columns: 1fr;
  }

  .search-stats {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }

  .agent-card {
    padding: 16px;
  }
}
</style>