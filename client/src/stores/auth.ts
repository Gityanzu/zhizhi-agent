import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User, LoginParams, RegisterParams } from '../api/auth';
import { login as apiLogin, register as apiRegister, getCurrentUser } from '../api/auth';
import { setToken, clearToken, getToken } from '../api/request';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(getToken());
  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const isLoading = ref(false);

  // 登录
  async function login(params: LoginParams) {
    isLoading.value = true;
    try {
      const res = await apiLogin(params);
      token.value = res.data.token;
      user.value = res.data.user;
      setToken(res.data.token);
      return res.data;
    } finally {
      isLoading.value = false;
    }
  }

  // 注册
  async function register(params: RegisterParams) {
    isLoading.value = true;
    try {
      const res = await apiRegister(params);
      token.value = res.data.token;
      user.value = res.data.user;
      setToken(res.data.token);
      return res.data;
    } finally {
      isLoading.value = false;
    }
  }

  // 登出
  function logout() {
    user.value = null;
    token.value = null;
    clearToken();
  }

  // 获取当前用户信息
  async function fetchCurrentUser() {
    if (!token.value) return null;
    try {
      const res = await getCurrentUser();
      user.value = res.data.user;
      return res.data.user;
    } catch (error) {
      // token无效，清除
      logout();
      return null;
    }
  }

  // 初始化（应用启动时调用）
  async function init() {
    if (token.value) {
      await fetchCurrentUser();
    }
  }

  // 更新用户信息
  function setUser(userData: User) {
    user.value = userData;
  }

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    fetchCurrentUser,
    init,
    setUser,
  };
});
