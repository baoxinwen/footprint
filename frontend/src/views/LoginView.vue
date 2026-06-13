<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'

const auth = useAuthStore()
const activeTab = ref('login')

const loginForm = ref({ username: '', password: '' })
const registerForm = ref({ username: '', password: '', confirmPassword: '' })
const loading = ref(false)

async function handleLogin() {
  if (!loginForm.value.username || !loginForm.value.password) {
    ElMessage.warning('请填写用户名和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(loginForm.value.username, loginForm.value.password)
  } catch {
    // error handled by interceptor
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  if (!registerForm.value.username || !registerForm.value.password) {
    ElMessage.warning('请填写用户名和密码')
    return
  }
  if (registerForm.value.password !== registerForm.value.confirmPassword) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }
  loading.value = true
  try {
    await auth.register(registerForm.value.username, registerForm.value.password)
    ElMessage.success('注册成功，请登录')
    activeTab.value = 'login'
    loginForm.value.username = registerForm.value.username
    loginForm.value.password = ''
  } catch {
    // error handled by interceptor
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-bg"></div>
    <div class="login-content">
      <div class="login-card">
        <div class="login-brand">
          <h1 class="brand-title">旅行足迹</h1>
          <p class="brand-subtitle">记录每一段旅程</p>
        </div>

        <div class="login-tabs">
          <button
            :class="['tab-btn', { active: activeTab === 'login' }]"
            @click="activeTab = 'login'"
          >登录</button>
          <button
            :class="['tab-btn', { active: activeTab === 'register' }]"
            @click="activeTab = 'register'"
          >注册</button>
        </div>

        <form v-if="activeTab === 'login'" @submit.prevent="handleLogin" class="login-form">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input
              v-model="loginForm.username"
              type="text"
              class="form-input"
              placeholder="请输入用户名"
              autocomplete="username"
            />
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input
              v-model="loginForm.password"
              type="password"
              class="form-input"
              placeholder="请输入密码"
              autocomplete="current-password"
            />
          </div>
          <button type="submit" class="submit-btn" :disabled="loading">
            <span v-if="loading" class="btn-loading"></span>
            <span v-else>登录</span>
          </button>
        </form>

        <form v-else @submit.prevent="handleRegister" class="login-form">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input
              v-model="registerForm.username"
              type="text"
              class="form-input"
              placeholder="3-50个字符，字母数字下划线"
              autocomplete="username"
            />
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input
              v-model="registerForm.password"
              type="password"
              class="form-input"
              placeholder="至少6位"
              autocomplete="new-password"
            />
          </div>
          <div class="form-group">
            <label class="form-label">确认密码</label>
            <input
              v-model="registerForm.confirmPassword"
              type="password"
              class="form-input"
              placeholder="再次输入密码"
              autocomplete="new-password"
            />
          </div>
          <button type="submit" class="submit-btn" :disabled="loading">
            <span v-if="loading" class="btn-loading"></span>
            <span v-else>注册</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: var(--color-cream);
}

.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 20% 50%, rgba(212, 168, 83, 0.08) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 20%, rgba(196, 112, 75, 0.06) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 80%, rgba(122, 158, 126, 0.05) 0%, transparent 50%);
}

.login-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
  padding: 20px;
}

.login-card {
  background: var(--color-warm-white);
  border-radius: var(--radius-xl);
  padding: 40px 36px;
  box-shadow: var(--shadow-elevated);
  border: 1px solid var(--color-warm-gray-100);
}

.login-brand {
  text-align: center;
  margin-bottom: 36px;
}

.brand-title {
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-warm-gray-900);
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.brand-subtitle {
  font-size: 14px;
  color: var(--color-warm-gray-500);
  letter-spacing: 0.1em;
}

.login-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 28px;
  background: var(--color-cream);
  border-radius: var(--radius-md);
  padding: 4px;
}

.tab-btn {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-warm-gray-500);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.25s ease;
}

.tab-btn.active {
  background: var(--color-warm-white);
  color: var(--color-warm-gray-900);
  box-shadow: var(--shadow-soft);
  font-weight: 600;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-warm-gray-700);
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--color-warm-gray-900);
  background: var(--color-cream);
  transition: all 0.2s ease;
  outline: none;
}

.form-input::placeholder {
  color: var(--color-warm-gray-300);
}

.form-input:focus {
  border-color: var(--color-amber);
  box-shadow: 0 0 0 3px rgba(212, 168, 83, 0.15);
  background: var(--color-warm-white);
}

.submit-btn {
  width: 100%;
  padding: 13px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-amber);
  color: white;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  margin-top: 4px;
  position: relative;
  overflow: hidden;
}

.submit-btn:hover:not(:disabled) {
  background: var(--color-amber-dark);
  transform: translateY(-1px);
  box-shadow: var(--shadow-warm);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-loading {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 480px) {
  .login-card {
    padding: 32px 24px;
  }

  .brand-title {
    font-size: 24px;
  }
}
</style>
