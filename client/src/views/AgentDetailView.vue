<template>
  <div class="agent-detail">
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else-if="agent" class="detail-content">
      <!-- 头部信息 -->
      <div class="agent-header">
        <div class="avatar-section">
          <div class="agent-avatar">
            <img v-if="agent.avatar" :src="agent.avatar" :alt="agent.name" />
            <div v-else class="avatar-placeholder">{{ agent.name.charAt(0) }}</div>
          </div>
          <div class="agent-basic-info">
            <h1 class="agent-name">{{ agent.name }}</h1>
            <p class="agent-description">{{ agent.description }}</p>
            <div class="agent-meta">
              <span v-if="agent.category" class="meta-tag">
                <i class="category-icon">📂</i>
                {{ agent.category }}
              </span>
              <span class="meta-tag">
                <i class="template-icon">📄</i>
                {{ agent.templateCount }} 个模板
              </span>
              <span class="meta-tag">
                <i class="view-icon">👁️</i>
                {{ agent.viewCount }} 次浏览
              </span>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <button
            v-if="canRate"
            @click="showRatingModal = true"
            class="action-button primary"
          >
            <i class="star-icon">⭐</i>
            {{ hasRated ? '修改评分' : '评分' }}
          </button>
          <button
            v-if="canComment"
            @click="showCommentModal = true"
            class="action-button secondary"
          >
            <i class="comment-icon">💬</i>
            写评论
          </button>
        </div>
      </div>

      <!-- 评分统计 -->
      <div class="rating-section">
        <div class="rating-overview">
          <div class="rating-score">
            <div class="score-value">{{ stats.averageRating || '-' }}</div>
            <div class="score-label">平均评分</div>
          </div>
          <div class="rating-distribution">
            <div
              v-for="item in ratingDistribution"
              :key="item.rating"
              class="distribution-item"
            >
              <span class="rating-stars">{{ '⭐'.repeat(item.rating) }}</span>
              <div class="rating-bar-container">
                <div
                  class="rating-bar"
                  :style="{ width: `${(item.count / stats.totalRatings) * 100}%` }"
                ></div>
              </div>
              <span class="rating-count">{{ item.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 评论区域 -->
      <div class="comments-section">
        <div class="section-header">
          <h2 class="section-title">评论 ({{ totalComments }})</h2>
          <div class="comment-actions">
            <select v-model="commentSort" class="sort-select">
              <option value="latest">最新</option>
              <option value="highest">评分最高</option>
            </select>
          </div>
        </div>

        <!-- 评论列表 -->
        <div class="comments-list">
          <div v-if="comments.length === 0" class="no-comments">
            <p>暂无评论，快来抢沙发吧！</p>
          </div>
          <div v-else class="comment-items">
            <div v-for="comment in comments" :key="comment.id" class="comment-item">
              <div class="comment-header">
                <div class="comment-user">
                  <div class="user-avatar">{{ comment.userId.charAt(0) }}</div>
                  <div class="user-info">
                    <span class="user-name">用户 {{ comment.userId.substring(0, 8) }}</span>
                    <span class="comment-time">{{ formatTime(comment.createdAt) }}</span>
                  </div>
                </div>
                <div class="comment-actions">
                  <button @click="() => likeCommentAPI({ commentId: comment.id, userId: authStore.user?.id || 'guest' })" class="like-button">
                    <i class="like-icon">👍</i>
                    {{ comment.likes }}
                  </button>
                  <button
                    v-if="canDeleteComment(comment)"
                    @click="deleteCommentAPI(comment.id)"
                    class="delete-button"
                  >
                    删除
                  </button>
                </div>
              </div>
              <div class="comment-content">{{ comment.content }}</div>
            </div>
          </div>
        </div>

        <!-- 加载更多 -->
        <div v-if="comments.length > 0" class="load-more">
          <button
            @click="loadMoreComments"
            :disabled="loadingMore"
            class="load-more-button"
          >
            {{ loadingMore ? '加载中...' : '加载更多' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 评分弹窗 -->
    <div v-if="showRatingModal" class="modal-overlay" @click.self="showRatingModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ hasRated ? '修改评分' : '评分' }}</h2>
          <button @click="showRatingModal = false" class="close-button">×</button>
        </div>
        <div class="modal-body">
          <div class="rating-stars-input">
            <span
              v-for="star in 5"
              :key="star"
              @click="setRating(star)"
              class="star-input"
              :class="{ active: rating >= star }"
            >
              {{ rating >= star ? '⭐' : '☆' }}
            </span>
          </div>
          <textarea
            v-model="ratingComment"
            placeholder="写点评论吧（选填）"
            class="rating-comment"
          ></textarea>
          <div class="rating-errors">{{ ratingErrors.join('、') }}</div>
        </div>
        <div class="modal-footer">
          <button @click="showRatingModal = false" class="cancel-button">取消</button>
          <button @click="submitRating" class="submit-button" :disabled="!isValidRating">
            提交
          </button>
        </div>
      </div>
    </div>

    <!-- 评论弹窗 -->
    <div v-if="showCommentModal" class="modal-overlay" @click.self="showCommentModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2>写评论</h2>
          <button @click="showCommentModal = false" class="close-button">×</button>
        </div>
        <div class="modal-body">
          <textarea
            v-model="commentContent"
            placeholder="分享你的想法..."
            class="comment-input"
            rows="6"
          ></textarea>
          <div class="comment-errors">{{ commentErrors.join('、') }}</div>
        </div>
        <div class="modal-footer">
          <button @click="showCommentModal = false" class="cancel-button">取消</button>
          <button @click="submitComment" class="submit-button" :disabled="!isValidComment">
            提交
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import {
  getComments,
  createComment,
  deleteComment as deleteCommentAPI,
  likeComment as likeCommentAPI,
  getCommentStats,
  type CommentRequest,
} from '../api/agentComment';
import type { CommentTree } from '../api/agentComment';

const route = useRoute();
const authStore = useAuthStore();

// 状态
const loading = ref(false);
const loadingMore = ref(false);
const agent = ref<any>(null);
const stats = ref<any>(null);
const ratingDistribution = ref<any[]>([]); // 评分分布
const comments = ref<CommentTree[]>([]);
const totalComments = ref(0);
const canRate = ref(false);
const hasRated = ref(false);
const canComment = ref(false);

// 评分相关
const showRatingModal = ref(false);
const rating = ref(0);
const ratingComment = ref('');
const ratingErrors = ref<string[]>([]);

// 评论相关
const showCommentModal = ref(false);
const commentContent = ref('');
const commentErrors = ref<string[]>([]);
const commentSort = ref('latest');

// 初始化
onMounted(async () => {
  const agentId = route.params.id as string;
  await loadAgent(agentId);
});

// 加载 Agent 信息
const loadAgent = async (agentId: string) => {
  loading.value = true;
  try {
    // TODO: 获取 Agent 详细信息
    // 这里需要从 API 获取 Agent 信息
    // agent.value = await getAgent(agentId);

    // 模拟数据
    agent.value = {
      id: agentId,
      name: '示例 Agent',
      description: '这是一个示例 Agent 的描述',
      avatar: '',
      category: '聊天',
      tags: ['常用', '工具'],
      rating: 4.5,
      ratingCount: 120,
      viewCount: 2500,
      templateCount: 5,
    };

    // 获取统计信息
    const statsData = await getCommentStats(agentId);
    stats.value = statsData;

    // 加载评论
    await loadComments();

    // 检查权限
    // TODO: 从 store 获取用户信息
    canRate.value = true;
    canComment.value = true;
  } catch (error) {
    console.error('加载失败:', error);
  } finally {
    loading.value = false;
  }
};

// 加载评论
const loadComments = async () => {
  const agentId = agent.value.id;
  try {
    const response = await getComments(agentId, 1, 20);
    comments.value = response.comments;
    totalComments.value = response.total;
  } catch (error) {
    console.error('加载评论失败:', error);
  }
};

// 加载更多评论
const loadMoreComments = async () => {
  loadingMore.value = true;
  try {
    const agentId = agent.value.id;
    const newPage = comments.value.length / 20 + 1;
    const response = await getComments(agentId, newPage, 20);
    comments.value.push(...response.comments);
    totalComments.value = response.total;
  } catch (error) {
    console.error('加载更多评论失败:', error);
  } finally {
    loadingMore.value = false;
  }
};

// 点赞评论
const handleLikeComment = async (commentId: string) => {
  try {
    const userId = authStore.user?.id || 'guest';
    await likeComment({ commentId, userId });
    // 更新评论的点赞数
    const comment = comments.value.find(c => c.id === commentId);
    if (comment) {
      comment.likes += 1;
    }
  } catch (error) {
    console.error('点赞失败:', error);
  }
};

// 删除评论
const canDeleteComment = (comment: CommentTree) => {
  // TODO: 检查是否是当前用户
  return authStore.user?.id === comment.userId;
};

const handleDeleteComment = async (commentId: string) => {
  if (!confirm('确定要删除这条评论吗？')) return;

  try {
    await deleteComment(commentId);
    // 从列表中移除
    comments.value = comments.value.filter(c => c.id !== commentId);
    totalComments.value--;
  } catch (error) {
    console.error('删除评论失败:', error);
  }
};

// 评分相关
const setRating = (star: number) => {
  rating.value = star;
  ratingErrors.value = [];
};

const isValidRating = () => {
  ratingErrors.value = [];
  if (rating.value === 0) {
    ratingErrors.value.push('请选择评分');
  }
  return ratingErrors.value.length === 0;
};

const submitRating = async () => {
  if (!isValidRating()) return;

  try {
    const agentId = agent.value.id;
    const userId = 'current-user'; // TODO: 从 store 获取
    await createComment({
      agentId,
      content: ratingComment.value,
      userId,
      parentId: undefined,
    } as CommentRequest & { userId: string });

    // 刷新评论列表
    await loadComments();

    // 关闭弹窗
    showRatingModal.value = false;

    // 重置表单
    rating.value = 0;
    ratingComment.value = '';
  } catch (error) {
    console.error('提交评分失败:', error);
  }
};

// 评论相关
const isValidComment = () => {
  commentErrors.value = [];
  if (!commentContent.value.trim()) {
    commentErrors.value.push('评论内容不能为空');
  }
  if (commentContent.value.trim().length < 10) {
    commentErrors.value.push('评论内容至少需要10个字符');
  }
  if (commentContent.value.trim().length > 2000) {
    commentErrors.value.push('评论内容不能超过2000个字符');
  }
  return commentErrors.value.length === 0;
};

const submitComment = async () => {
  if (!isValidComment()) return;

  try {
    const agentId = agent.value.id;
    const userId = 'current-user'; // TODO: 从 store 获取
    await createComment({
      agentId,
      content: commentContent.value,
      userId,
      parentId: undefined,
    } as CommentRequest & { userId: string });

    // 刷新评论列表
    await loadComments();

    // 关闭弹窗
    showCommentModal.value = false;

    // 重置表单
    commentContent.value = '';
  } catch (error) {
    console.error('提交评论失败:', error);
  }
};

// 格式化时间
const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString();
};
</script>

<style scoped>
.agent-detail {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
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

.detail-content {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.agent-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 30px;
  background: white;
  border-radius: 12px;
  margin-bottom: 30px;
}

.avatar-section {
  display: flex;
  gap: 20px;
}

.agent-avatar {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  overflow: hidden;
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
  font-size: 36px;
  font-weight: bold;
}

.agent-basic-info {
  flex: 1;
}

.agent-name {
  margin: 0 0 10px;
  font-size: 28px;
  font-weight: 700;
  color: #333;
}

.agent-description {
  margin: 0 0 15px;
  font-size: 15px;
  color: #666;
  line-height: 1.6;
}

.agent-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}

.meta-tag {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  color: #666;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-button {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-button.primary {
  background-color: #3b82f6;
  color: white;
}

.action-button.primary:hover {
  background-color: #2563eb;
}

.action-button.secondary {
  background-color: #f3f4f6;
  color: #333;
}

.action-button.secondary:hover {
  background-color: #e5e7eb;
}

.rating-section {
  padding: 30px;
  background: white;
  border-radius: 12px;
  margin-bottom: 30px;
}

.rating-overview {
  display: flex;
  gap: 40px;
}

.rating-score {
  text-align: center;
}

.score-value {
  font-size: 48px;
  font-weight: 700;
  color: #fbbf24;
}

.score-label {
  margin-top: 8px;
  font-size: 14px;
  color: #666;
}

.rating-distribution {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.distribution-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rating-stars {
  font-size: 20px;
  min-width: 100px;
}

.rating-bar-container {
  flex: 1;
  height: 24px;
  background: #f3f4f6;
  border-radius: 12px;
  overflow: hidden;
}

.rating-bar {
  height: 100%;
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
  border-radius: 12px;
  transition: width 0.3s;
}

.rating-count {
  min-width: 30px;
  text-align: right;
  font-size: 14px;
  color: #666;
}

.comments-section {
  background: white;
  border-radius: 12px;
  padding: 30px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e0e0e0;
}

.section-title {
  margin: 0;
  font-size: 24px;
  color: #333;
}

.comment-actions {
  display: flex;
  gap: 10px;
}

.sort-select {
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: white;
  cursor: pointer;
}

.comments-list {
  min-height: 200px;
}

.no-comments {
  text-align: center;
  padding: 40px;
  color: #999;
}

.comment-items {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.comment-item {
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.comment-user {
  display: flex;
  gap: 12px;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e0e7ff;
  color: #4338ca;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 16px;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.user-name {
  font-weight: 600;
}

.comment-time {
  margin-left: 8px;
  font-size: 12px;
  color: #999;
}

.comment-actions {
  display: flex;
  gap: 15px;
}

.like-button,
.delete-button {
  padding: 6px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.like-button:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.delete-button:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.like-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.comment-content {
  margin-top: 10px;
  font-size: 15px;
  color: #333;
  line-height: 1.6;
}

.load-more {
  text-align: center;
  margin-top: 20px;
}

.load-more-button {
  padding: 10px 30px;
  background-color: #f3f4f6;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.load-more-button:hover:not(:disabled) {
  background-color: #e5e7eb;
}

.load-more-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  width: 500px;
  max-width: 90%;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  animation: modalIn 0.3s ease-out;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 30px;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
}

.close-button {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.close-button:hover {
  color: #333;
}

.modal-body {
  padding: 30px;
}

.rating-stars-input {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.star-input {
  font-size: 32px;
  cursor: pointer;
  opacity: 0.3;
  transition: opacity 0.3s;
}

.star-input:hover,
.star-input.active {
  opacity: 1;
}

.rating-comment,
.comment-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
}

.rating-comment:focus,
.comment-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.rating-errors,
.comment-errors {
  margin-top: 10px;
  color: #ef4444;
  font-size: 14px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px 30px;
  border-top: 1px solid #e0e0e0;
}

.cancel-button,
.submit-button {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
}

.cancel-button {
  background-color: #f3f4f6;
  color: #333;
}

.cancel-button:hover {
  background-color: #e5e7eb;
}

.submit-button {
  background-color: #3b82f6;
  color: white;
}

.submit-button:hover:not(:disabled) {
  background-color: #2563eb;
}

.submit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
