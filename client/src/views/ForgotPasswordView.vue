<template>
  <div class="forgot-password-page">
    <div class="card">
      <h2 v-if="!sent">忘记密码</h2>
      <h2 v-else>检查邮箱</h2>

      <div v-if="!sent" class="form">
        <el-alert
          title="安全提示"
          type="info"
          :closable="false"
          style="margin-bottom: 20px"
        >
          我们将向您的注册邮箱发送重置密码的链接，链接1小时后过期
        </el-alert>

        <el-form
          :model="form"
          :rules="rules"
          ref="formRef"
          label-width="80px"
          @submit.prevent="handleForgotPassword"
        >
          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model="form.email"
              placeholder="请输入注册邮箱"
              @keyup.enter="handleForgotPassword"
            />
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              @click="handleForgotPassword"
              :loading="loading"
              style="width: 100%"
            >
              发送重置链接
            </el-button>
          </el-form-item>

          <el-form-item>
            <div class="links">
              <router-link to="/login">返回登录</router-link>
              <router-link to="/register">注册账号</router-link>
            </div>
          </el-form-item>
        </el-form>
      </div>

      <div v-else class="success">
        <el-result
          icon="success"
          title="邮件已发送"
          sub-title="如果该邮箱已注册，您将收到重置密码的邮件。如果1小时内未收到邮件，请检查垃圾邮件文件夹。"
        >
          <template #extra>
            <el-button type="primary" @click="resend">重新发送</el-button>
            <router-link to="/login">
              <el-button>返回登录</el-button>
            </router-link>
          </template>
        </el-result>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { forgotPassword } from '@/api/auth';

const router = useRouter();
const route = useRoute();
const formRef = ref();
const loading = ref(false);
const sent = ref(false);

const form = reactive({
  email: ''
});

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }
  ]
};

async function handleForgotPassword() {
  try {
    await formRef.value.validate();

    loading.value = true;

    await forgotPassword(form.email);

    sent.value = true;
    ElMessage.success('如果该邮箱已注册，您将收到重置密码的邮件');
  } catch (error: any) {
    if (error.errors) {
      // 表单验证错误
    } else {
      ElMessage.error(error.response?.data?.error || '发送失败，请重试');
    }
  } finally {
    loading.value = false;
  }
}

async function resend() {
  sent.value = false;
  await handleForgotPassword();
}

// 如果URL中有token参数，显示重置密码表单
const token = route.query.token as string;
const newPassword = route.query.newPassword as string;

if (token && newPassword) {
  router.push({
    path: '/reset-password',
    query: { token, newPassword }
  });
}
</script>

<style scoped>
.forgot-password-page {
  max-width: 500px;
  margin: 0 auto;
  padding: 40px 20px;
}

.card {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.card h2 {
  margin-top: 0;
  margin-bottom: 30px;
  font-size: 24px;
  color: #333;
  text-align: center;
}

.form {
  margin-top: 20px;
}

.links {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #606266;
}

.links a {
  color: #3b82f6;
}

.links a:hover {
  text-decoration: underline;
}

.success {
  margin-top: 20px;
}
</style>
