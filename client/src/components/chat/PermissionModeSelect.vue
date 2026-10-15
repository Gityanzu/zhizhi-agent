<script setup lang="ts">
/**
 * PermissionModeSelect —— Agent 权限模式下拉（本机默认权限 / 允许全部权限）
 *
 * 点击展开下拉，两个选项各带一句说明：用户不必去设置页猜"允许全部"到底放开了什么、
 * 又保留了哪些底线。切换即时保存（按用户存），不需要再点"保存偏好"。
 *
 * 不支持的环境（Web 托管后端）："允许全部权限"置灰并写明原因，
 * 当前值恒显示为"本机默认权限" —— 显示成一个用不了的模式只会制造困惑。
 */
import { computed, onMounted } from 'vue'
import { ArrowDown, Check, Lock, Unlock } from '@element-plus/icons-vue'
import { usePermissionStore } from '@/stores/permission'

withDefaults(defineProps<{ size?: 'small' | 'default' }>(), { size: 'small' })

const store = usePermissionStore()

onMounted(() => store.ensureLoaded())

const isFull = computed(() => store.effectiveMode === 'full')

function choose(cmd: string | number | object) {
  void store.setMode(String(cmd) === 'full' ? 'full' : 'sandbox')
}
</script>

<template>
  <el-dropdown trigger="click" placement="top-start" @command="choose">
    <button
      class="perm-select-btn"
      :class="{ 'is-full': isFull }"
      :title="isFull ? 'Agent 拥有本机读写与执行权限（敏感文件仍拒绝）' : 'Agent 越界读写或执行命令前会请你确认'"
    >
      <el-icon><component :is="isFull ? Unlock : Lock" /></el-icon>
      <span>{{ isFull ? '允许全部权限' : '本机默认权限' }}</span>
      <el-icon class="arrow-icon"><ArrowDown /></el-icon>
    </button>

    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="sandbox">
          <div class="perm-option">
            <div class="perm-option-title">
              <el-icon><Lock /></el-icon>
              <span>本机默认权限</span>
              <el-icon v-if="!isFull" class="check-icon"><Check /></el-icon>
            </div>
            <div class="perm-option-desc">读写输出目录之外的文件、执行命令前会弹窗确认</div>
          </div>
        </el-dropdown-item>

        <el-dropdown-item command="full" :disabled="!store.fullAccessSupported">
          <div class="perm-option">
            <div class="perm-option-title">
              <el-icon><Unlock /></el-icon>
              <span>允许全部权限</span>
              <el-icon v-if="isFull" class="check-icon"><Check /></el-icon>
            </div>
            <div class="perm-option-desc">
              {{
                store.fullAccessSupported
                  ? '不再逐次确认，Agent 可直接读写本机；凭据/密钥等敏感文件仍会拒绝访问'
                  : '当前运行环境不支持（仅桌面端可用）'
              }}
            </div>
          </div>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.perm-select-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #111827);
  white-space: nowrap;
}
.perm-select-btn:hover {
  border-color: var(--primary-color, #6366f1);
  color: var(--primary-color, #6366f1);
}
/* 完全访问是"授权"状态，用醒目的橙色常驻提示，避免用户忘了自己开着 */
.perm-select-btn.is-full {
  border-color: #f59e0b;
  color: #b45309;
  background: #fffbeb;
}
.perm-select-btn .arrow-icon {
  font-size: 12px;
}

.perm-option {
  padding: 2px 0;
  max-width: 260px;
}
.perm-option-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.perm-option-title .check-icon {
  margin-left: auto;
}
.perm-option-desc {
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: normal;
  line-height: 1.5;
}
</style>
