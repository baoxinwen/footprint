<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'

const auth = useAuthStore()
type AccountTab = 'login' | 'register'
const activeTab = ref<AccountTab>('login')
const loginTabRef = ref<HTMLButtonElement | null>(null)
const registerTabRef = ref<HTMLButtonElement | null>(null)

// 登录页彩蛋：果园路坐标。点击在高德地图中打开同名图钉
// （uri.amap.com marker 协议，GCJ-02 坐标；移动端 callnative=1 可唤起 App）
const HOME_MARKER = {
  lng: 118.273211,
  lat: 32.098298,
  name: '果园路',
}
const HOME_AMAP_URL =
  `https://uri.amap.com/marker?position=${HOME_MARKER.lng},${HOME_MARKER.lat}` +
  `&name=${encodeURIComponent(HOME_MARKER.name)}&src=footprint&coordinate=gaofen&callnative=1`

const loginForm = ref({ username: '', password: '' })
const registerForm = ref({ username: '', password: '', confirmPassword: '' })
const loading = ref(false)

function focusTab(tab: AccountTab) {
  activeTab.value = tab
  nextTick(() => {
    const target = tab === 'login' ? loginTabRef.value : registerTabRef.value
    target?.focus()
  })
}

function handleTabKeydown(event: KeyboardEvent) {
  let target: AccountTab | null = null
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    target = activeTab.value === 'login' ? 'register' : 'login'
  } else if (event.key === 'Home') {
    target = 'login'
  } else if (event.key === 'End') {
    target = 'register'
  }

  if (!target) return
  event.preventDefault()
  focusTab(target)
}

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
    <div class="login-map-field" aria-hidden="true">
      <svg class="field-contour" viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-20 720 C 120 660, 200 760, 340 700 S 560 620, 660 680" />
        <path d="M-20 640 C 100 590, 220 670, 360 610 S 560 540, 660 590" />
        <path d="M-20 560 C 90 520, 240 590, 380 530 S 560 460, 660 500" />
        <path d="M-20 480 C 80 450, 260 510, 400 450 S 570 380, 660 410" />
        <path d="M-20 400 C 70 380, 280 430, 420 380 S 580 310, 660 330" />
        <path d="M-20 320 C 60 310, 300 350, 440 310 S 590 250, 660 260" />
        <path d="M-20 240 C 50 240, 320 270, 460 240 S 600 190, 660 200" />
      </svg>
      <span class="field-route" aria-hidden="true"></span>
      <span class="field-marker" aria-hidden="true"></span>
      <a
        class="field-coordinate"
        :href="HOME_AMAP_URL"
        target="_blank"
        rel="noopener noreferrer"
        title="在高德地图中查看：全椒县 · 果园路"
      >32.0983 N · 118.2732 E</a>

      <div class="brand-block">
        <p class="brand-kicker">私人旅行档案</p>
        <h1 class="brand-title">旅行足迹</h1>
        <p class="brand-subtitle">登录后继续整理你的地图与旅程</p>
      </div>
    </div>

    <main class="login-shell">
      <section class="login-panel" aria-label="账户登录与注册">
        <div class="login-tabs" role="tablist" aria-label="账户操作">
          <button
            ref="loginTabRef"
            :class="['tab-btn', { active: activeTab === 'login' }]"
            type="button"
            role="tab"
            id="login-tab"
            aria-controls="login-panel"
            :aria-selected="activeTab === 'login'"
            :tabindex="activeTab === 'login' ? 0 : -1"
            @click="activeTab = 'login'"
            @keydown="handleTabKeydown"
          >登录</button>
          <button
            ref="registerTabRef"
            :class="['tab-btn', { active: activeTab === 'register' }]"
            type="button"
            role="tab"
            id="register-tab"
            aria-controls="register-panel"
            :aria-selected="activeTab === 'register'"
            :tabindex="activeTab === 'register' ? 0 : -1"
            @click="activeTab = 'register'"
            @keydown="handleTabKeydown"
          >注册</button>
        </div>

        <form
          v-if="activeTab === 'login'"
          id="login-panel"
          class="login-form"
          role="tabpanel"
          aria-labelledby="login-tab"
          @submit.prevent="handleLogin"
        >
          <div class="form-group">
            <label class="form-label" for="login-username">用户名</label>
            <input
              id="login-username"
              v-model="loginForm.username"
              name="username"
              type="text"
              class="form-input"
              placeholder="请输入用户名"
              autocomplete="username"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="login-password">密码</label>
            <input
              id="login-password"
              v-model="loginForm.password"
              name="password"
              type="password"
              class="form-input"
              placeholder="请输入密码"
              autocomplete="current-password"
            />
          </div>
          <button type="submit" class="submit-btn" :disabled="loading">
            <span v-if="loading" class="btn-loading" aria-hidden="true"></span>
            <span v-if="loading" class="visually-hidden">正在登录</span>
            <span v-else>登录</span>
          </button>
        </form>

        <form
          v-else
          id="register-panel"
          class="login-form"
          role="tabpanel"
          aria-labelledby="register-tab"
          @submit.prevent="handleRegister"
        >
          <div class="form-group">
            <label class="form-label" for="register-username">用户名</label>
            <input
              id="register-username"
              v-model="registerForm.username"
              name="username"
              type="text"
              class="form-input"
              placeholder="3-50个字符，字母数字下划线"
              autocomplete="username"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="register-password">密码</label>
            <input
              id="register-password"
              v-model="registerForm.password"
              name="password"
              type="password"
              class="form-input"
              placeholder="至少6位"
              autocomplete="new-password"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="register-password-confirm">确认密码</label>
            <input
              id="register-password-confirm"
              v-model="registerForm.confirmPassword"
              name="password-confirm"
              type="password"
              class="form-input"
              placeholder="再次输入密码"
              autocomplete="new-password"
            />
          </div>
          <button type="submit" class="submit-btn" :disabled="loading">
            <span v-if="loading" class="btn-loading" aria-hidden="true"></span>
            <span v-if="loading" class="visually-hidden">正在注册</span>
            <span v-else>注册</span>
          </button>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 520px);
  background: var(--color-canvas);
}

/* ========== 左侧品牌区：等高线地图纹样 ========== */
.login-map-field {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(90% 80% at 30% 20%, color-mix(in srgb, var(--color-primary) 10%, transparent) 0%, transparent 60%),
    color-mix(in srgb, var(--color-primary-soft) 40%, var(--color-canvas));
}

.field-contour {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.field-contour path {
  fill: none;
  stroke: color-mix(in srgb, var(--color-primary) 24%, transparent);
  stroke-width: 1.6;
}

.field-route {
  position: absolute;
  left: 12%;
  top: 18%;
  width: 1px;
  height: 46%;
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-primary) 40%, transparent) 15% 85%, transparent);
}

.field-marker {
  position: absolute;
  left: 12%;
  top: 18%;
  width: 11px;
  height: 11px;
  transform: translate(-50%, -50%) rotate(45deg);
  background: var(--color-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 22%, transparent);
}

.field-coordinate {
  position: absolute;
  left: calc(12% + 20px);
  top: 18%;
  transform: translateY(-50%);
  font-size: var(--text-xs);
  letter-spacing: 0.14em;
  color: var(--color-ink-muted);
  text-decoration: none;
  transition: color var(--dur-fast) ease;
}

.field-coordinate:hover {
  color: var(--color-accent);
}

.brand-block {
  position: absolute;
  left: clamp(32px, 12vw, 22%);
  top: 50%;
  transform: translateY(-46%);
}

.brand-kicker {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.26em;
  color: var(--color-accent);
  margin-bottom: var(--space-md);
}

.brand-title {
  font-family: var(--font-serif);
  font-size: var(--text-3xl);
  line-height: var(--lh-3xl);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-ink);
}

.brand-subtitle {
  margin-top: var(--space-md);
  font-size: var(--text-base);
  color: var(--color-ink-secondary);
}

/* ========== 右侧表单区 ========== */
.login-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl) var(--space-xl);
  background: var(--color-canvas);
}

.login-panel {
  width: min(100%, 400px);
  padding: var(--space-xl);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.login-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  margin-bottom: var(--space-xl);
  border-radius: 999px;
  background: var(--color-surface-muted);
}

.tab-btn {
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-ink-muted);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  transition: color var(--dur-base) var(--ease-out), background-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}

.tab-btn:hover {
  color: var(--color-ink);
}

.tab-btn.active {
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: 600;
  box-shadow: var(--shadow-soft);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink-secondary);
}

.form-input {
  height: 46px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-canvas);
  color: var(--color-ink);
  font-size: var(--text-base);
  font-family: var(--font-sans);
  transition: border-color var(--dur-fast) ease, box-shadow var(--dur-fast) ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 14%, transparent);
}

.form-input::placeholder {
  color: var(--color-ink-muted);
}

.submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  margin-top: var(--space-sm);
  border: 0;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: 0.2em;
  cursor: pointer;
  transition: background-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}

.submit-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
  box-shadow: var(--shadow-primary);
  transform: translateY(-1px);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.btn-loading {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--color-on-primary) 40%, transparent);
  border-top-color: var(--color-on-primary);
  border-radius: 999px;
  animation: btnSpin 0.7s linear infinite;
}

@keyframes btnSpin {
  to { transform: rotate(360deg); }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ========== 响应式 ========== */
@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-map-field {
    display: none;
  }

  .login-shell {
    min-height: 100dvh;
    padding: var(--space-lg) var(--space-md);
  }

  .login-panel {
    box-shadow: var(--shadow-soft);
  }
}
</style>
