<template>
  <div class="reset-password-page">
    <div class="card">
      <h2>设置新密码</h2>

      <el-alert
        title="安全提示"
        type="info"
        :closable="false"
        style="margin-bottom: 20px"
      >
        设置的新密码必须符合以下要求：至少8个字符，包含大小写字母、数字和特殊字符
      </el-alert>

      <el-form
        :model="form"
        :rules="rules"
        ref="formRef"
        label-width="100px"
        @submit.prevent="handleResetPassword"
      >
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="form.newPassword"
            type="password"
            show-password
            placeholder="至少8个字符"
            @input="validateNewPassword"
            @keyup.enter="handleResetPassword"
          />
          <div v-if="passwordValidation" class="password-validation">
            <div v-for="(error, index) in passwordValidation.errors" :key="index" class="validation-item error">
              <el-icon><Close /></el-icon>
              <span>{{ error }}</span>
            </div>
            <div v-for="(suggestion, index) in passwordValidation.suggestions" :key="'sug-' + index" class="validation-item suggestion">
              <el-icon><Check /></el-icon>
              <span>{{ suggestion }}</span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            show-password
            placeholder="请再次输入新密码"
            @keyup.enter="handleResetPassword"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            @click="handleResetPassword"
            :loading="loading"
            :disabled="!isFormValid"
          >
            设置新密码
          </el-button>
          <el-button @click="goBack">取消</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ResetPassword } from '@/api/auth';

const router = useRouter();
const route = useRoute();
const formRef = ref();
const loading = ref(false);

const form = reactive({
  newPassword: '',
  confirmPassword: ''
});

const passwordValidation = ref<any>(null);

// 从URL获取token
const token = route.query.token as string;

// 密码强度验证
function validateNewPassword(value: string) {
  passwordValidation.value = {
    valid: false,
    errors: [],
    suggestions: []
  };

  if (value.length < 8) {
    passwordValidation.value.errors.push('密码长度至少8个字符');
    passwordValidation.value.suggestions.push('使用8个或更多字符');
  }

  if (!/[A-Z]/.test(value)) {
    passwordValidation.value.errors.push('必须包含大写字母');
    passwordValidation.value.suggestions.push('添加大写字母如 "A"');
  }

  if (!/[a-z]/.test(value)) {
    passwordValidation.value.errors.push('必须包含小写字母');
    passwordValidation.value.suggestions.push('添加小写字母如 "a"');
  }

  if (!/[0-9]/.test(value)) {
    passwordValidation.value.errors.push('必须包含数字');
    passwordValidation.value.suggestions.push('添加数字如 "1"');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
    passwordValidation.value.errors.push('必须包含特殊字符');
    passwordValidation.value.suggestions.push('添加特殊字符如 "!" 或 "@"');
  }

  passwordValidation.value.valid = passwordValidation.value.errors.length === 0;
}

const isFormValid = computed(() => {
  return (
    passwordValidation.value?.valid &&
    form.newPassword === form.confirmPassword &&
    form.newPassword.length >= 8
  );
});

const rules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码长度至少8个字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (rule: any, value: string, callback: any) => {
        if (value !== form.newPassword) {
          callback(new Error('两次输入的密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ]
};

async function handleResetPassword() {
  try {
    if (!token) {
      ElMessage.error('重置链接无效');
      router.push('/forgot-password');
      return;
    }

    await formRef.value.validate();

    if (!isFormValid.value) {
      ElMessage.warning('请填写完整的密码信息');
      return;
    }

    loading.value = true;

    await ResetPassword(token, form.newPassword);

    ElMessage.success('密码重置成功，请使用新密码登录');
    router.push('/login');
  } catch (error: any) {
    if (error.errors) {
      // 表单验证错误
    } else if (error.response?.data?.error) {
      ElMessage.error(error.response.data.error);
    } else {
      ElMessage.error('密码重置失败，请重试');
    }
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.back();
}

// 页面加载时验证token
onMounted(() => {
  if (!token) {
    ElMessage.error('重置链接无效');
    router.push('/forgot-password');
  }
});
</script>

<style scoped>
.reset-password-page {
  max-width: 600px;
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
}

.password-validation {
  margin-top: 8px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
}

.validation-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.validation-item.error {
  color: #f56c6c;
}

.validation-item.suggestion {
  color: #67c23a;
}

.validation-item.error:last-child,
.validation-item.suggestion:last-child {
  margin-bottom: 0;
}
</style>
