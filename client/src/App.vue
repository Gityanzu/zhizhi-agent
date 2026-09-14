<template>
  <router-view />
  <!-- 全局用户设置弹窗 -->
  <UserSettings v-model="uiStore.showSettings" @saved="onSettingsSaved" />
</template>

<script setup lang="ts">
import UserSettings from '@/components/settings/UserSettings.vue'
import { useUiStore } from '@/stores/ui'

const uiStore = useUiStore()

function onSettingsSaved() {
  // 触发侧边栏刷新用户信息
  window.dispatchEvent(new CustomEvent('user-settings-updated'))
}
</script>

<style>
/* 全局样式在 styles/index.css 中 */
</style>
