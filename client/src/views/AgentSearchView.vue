<template>
  <div class="search-page">
    <div class="search-container">
      <!-- 搜索框 -->
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索 Agent..."
          class="search-input"
          @keyup.enter="handleSearch"
        />
        <button @click="handleSearch" class="search-button">搜索</button>
      </div>

      <!-- 筛选器 -->
      <div class="filters">
        <select v-model="selectedCategory" class="filter-select">
          <option :value="''">所有分类</option>
          <option v-for="category in categories" :key="category.name" :value="category.name">
            {{ category.name }}
          </option>
        </select>

        <select v-model="sortBy" class="filter-select">
          <option value="latest">最新</option>
          <option value="popular">热门</option>
          <option value="highest-rated">评分最高</option>
        </select>

        <select v-model="sortOrder" class="filter-select">
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
      </div>

      <!-- 标签筛选 -->
      <div v-if="popularTags.length > 0" class="tags-filter">
        <span class="filter-label">热门标签：</span>
        <button
          v-for="tag in popularTags"
          :key="tag"
          @click="toggleTag(tag)"
          :class="['tag-button', { active: selectedTags.includes(tag) }]"
        >
          {{ tag }}
        </button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <!-- 搜索结果 -->
    <div v-else-if="results.length > 0" class="results">
      <h2 class="results-title">找到 {{ total }} 个结果</h2>

      <div class="agent-list">
        <div
          v-for="agent in results"
          :key="agent.agentId"
          class="agent-card"
          @click="goToAgentDetail(agent.agentId)"
        >
          <div class="agent-avatar">
            <img v-if="agent.avatar" :src="agent.avatar" :alt="agent.name" />
            <div v-else class="avatar-placeholder">{{ agent.name.charAt(0) }}</div>
          </div>

          <div class="agent-info">
            <h3 class="agent-name">{{ agent.name }}</h3>
            <p class="agent-description">{{ agent.description }}</p>

            <div class="agent-meta">
              <span v-if="agent.category" class="meta-item">
                <i class="category-icon">📂</i>
                {{ agent.category }}
              </span>
              <span v-if="agent.rating" class="meta-item">
                <i class="rating-icon">⭐</i>
                {{ agent.rating }} ({{ agent.ratingCount }})
              </span>
              <span class="meta-item">
                <i class="view-icon">👁️</i>
                {{ agent.viewCount }}
              </span>
              <span class="meta-item">
                <i class="template-icon">📄</i>
                {{ agent.templateCount }}
              </span>
            </div>

            <div v-if="agent.tags && agent.tags.length > 0" class="agent-tags">
              <span v-for="tag in agent.tags.slice(0, 3)" :key="tag" class="agent-tag">
                {{ tag }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div class="pagination">
        <button
          @click="changePage(-1)"
          :disabled="page === 1"
          class="page-button"
        >
          上一页
        </button>
        <span class="page-info">第 {{ page }} 页 / 共 {{ totalPages }} 页</span>
        <button
          @click="changePage(1)"
          :disabled="page >= totalPages"
          class="page-button"
        >
          下一页
        </button>
      </div>
    </div>

    <!-- 无结果 -->
    <div v-else class="no-results">
      <i class="search-icon">🔍</i>
      <h3>没有找到相关结果</h3>
      <p>请尝试调整搜索条件</p>
      <button @click="resetFilters" class="reset-button">重置筛选</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  searchAgents,
  getCategoryList,
  getPopularTags,
  type SearchParams,
  type CategoryInfo,
} from '../api/agentSearch';

const router = useRouter();

// 状态
const loading = ref(false);
const searchQuery = ref('');
const selectedCategory = ref('');
const sortBy = ref('latest');
const sortOrder = ref('desc');
const selectedTags = ref<string[]>([]);
const popularTags = ref<string[]>([]);
const categories = ref<CategoryInfo[]>([]);

// 结果
const results = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const totalPages = ref(0);

// 初始化
onMounted(async () => {
  await loadCategories();
  await loadPopularTags();
  await performSearch();
});

// 加载分类
const loadCategories = async () => {
  try {
    const response = await getCategoryList();
    categories.value = response.categories;
  } catch (error) {
    console.error('加载分类失败:', error);
  }
};

// 加载热门标签
const loadPopularTags = async () => {
  try {
    const response = await getPopularTags(10);
    popularTags.value = response.tags;
  } catch (error) {
    console.error('加载热门标签失败:', error);
  }
};

// 执行搜索
const performSearch = async () => {
  loading.value = true;
  try {
    const params: SearchParams = {
      query: searchQuery.value || undefined,
      category: selectedCategory.value || undefined,
      tags: selectedTags.value.length > 0 ? selectedTags.value : undefined,
      sortBy: sortBy.value as any,
      sortOrder: sortOrder.value as any,
      page: page.value,
      pageSize,
    };

    const response = await searchAgents(params);
    results.value = response.results;
    total.value = response.total;
    totalPages.value = response.totalPages;
  } catch (error) {
    console.error('搜索失败:', error);
  } finally {
    loading.value = false;
  }
};

// 处理搜索
const handleSearch = () => {
  page.value = 1;
  performSearch();
};

// 切换标签
const toggleTag = (tag: string) => {
  const index = selectedTags.value.indexOf(tag);
  if (index > -1) {
    selectedTags.value.splice(index, 1);
  } else {
    selectedTags.value.push(tag);
  }
  page.value = 1;
  performSearch();
};

// 切换页面
const changePage = (delta: number) => {
  const newPage = page.value + delta;
  if (newPage >= 1 && newPage <= totalPages.value) {
    page.value = newPage;
    performSearch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// 重置筛选
const resetFilters = () => {
  searchQuery.value = '';
  selectedCategory.value = '';
  selectedTags.value = [];
  page.value = 1;
  performSearch();
};

// 跳转到详情页
const goToAgentDetail = (agentId: string) => {
  router.push({ name: 'AgentDetail', params: { id: agentId } });
};
</script>

<style scoped>
.search-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
}

.search-container {
  margin-bottom: 40px;
}

.search-box {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.search-input {
  flex: 1;
  padding: 12px 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.3s;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.search-button {
  padding: 12px 24px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.search-button:hover {
  background-color: #2563eb;
}

.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: white;
  cursor: pointer;
}

.tags-filter {
  margin-top: 20px;
}

.filter-label {
  margin-right: 10px;
  font-weight: 500;
}

.tag-button {
  padding: 6px 12px;
  margin-right: 8px;
  margin-bottom: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  background: white;
  cursor: pointer;
  transition: all 0.3s;
}

.tag-button:hover {
  border-color: #3b82f6;
}

.tag-button.active {
  background-color: #3b82f6;
  color: white;
  border-color: #3b82f6;
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

.results-title {
  margin-bottom: 30px;
  font-size: 24px;
  color: #333;
}

.agent-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.agent-card {
  display: flex;
  padding: 24px;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  cursor: pointer;
  transition: box-shadow 0.3s, transform 0.3s;
}

.agent-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.agent-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  margin-right: 20px;
  flex-shrink: 0;
}

.agent-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 32px;
  font-weight: bold;
}

.agent-info {
  flex: 1;
  overflow: hidden;
}

.agent-name {
  margin: 0 0 10px;
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.agent-description {
  margin: 0 0 15px;
  font-size: 14px;
  color: #666;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.agent-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #666;
}

.meta-item i {
  font-style: normal;
}

.agent-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.agent-tag {
  padding: 4px 10px;
  background-color: #f3f4f6;
  border-radius: 12px;
  font-size: 12px;
  color: #666;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 40px;
}

.page-button {
  padding: 10px 20px;
  background-color: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
}

.page-button:hover:not(:disabled) {
  border-color: #3b82f6;
  color: #3b82f6;
}

.page-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 14px;
  color: #666;
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
}

.search-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.no-results h3 {
  margin: 0 0 10px;
  font-size: 24px;
  color: #333;
}

.no-results p {
  margin: 0 0 30px;
  color: #666;
}

.reset-button {
  padding: 12px 30px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.reset-button:hover {
  background-color: #2563eb;
}
</style>
