<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { changePassword } from '../api/auth'
import request from '../api/request'
import { useAuthStore } from '../stores/auth'
import { useTheme } from '../composables/useTheme'
import { formatDateCN } from '../utils/format'
import { ElMessage } from 'element-plus'

const auth = useAuthStore()
const { themeMode, setTheme } = useTheme()

const userInfo = ref<{ id: number; username: string; created_at: string } | null>(null)
const form = ref({ current_password: '', new_password: '', confirm_password: '' })
const passwordLoading = ref(false)
const importLoading = ref(false)

onMounted(async () => {
  try {
    const { data } = await request.get('/account/info')
    userInfo.value = data
  } catch {
    ElMessage.error('加载账号信息失败')
  }
})

async function handleChangePassword() {
  if (!form.value.current_password || !form.value.new_password || !form.value.confirm_password) {
    ElMessage.warning('请填写所有字段')
    return
  }
  if (form.value.new_password !== form.value.confirm_password) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  if (form.value.new_password.length < 6) {
    ElMessage.warning('新密码至少6位')
    return
  }
  passwordLoading.value = true
  try {
    await changePassword(form.value.current_password, form.value.new_password)
    ElMessage.success('密码修改成功，请重新登录')
    auth.logout()
  } catch {
    ElMessage.error('密码修改失败')
  } finally {
    passwordLoading.value = false
  }
}

function handleThemeChange(mode: string) {
  setTheme(mode)
}

async function exportAll(format: 'json' | 'zip') {
  const url = format === 'json' ? '/account/export/all' : '/account/export/all-with-photos'
  const filename = format === 'json' ? '足迹数据备份.json' : '足迹数据备份.zip'
  try {
    const response = await request.get(url, { responseType: 'blob' })
    const blob = new Blob([response.data])
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(downloadUrl)
  } catch {
    ElMessage.error('导出失败')
  }
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    await request.post('/trips/import', formData)
    ElMessage.success('导入成功')
  } catch {
    ElMessage.error('导入失败')
  } finally {
    importLoading.value = false
    input.value = ''
  }
}

</script>

<template>
  <div class="settings-page">
    <div class="page-header">
      <h2 class="page-title">设置</h2>
    </div>

    <!-- Account Info -->
    <section class="settings-section stagger-item" style="animation-delay: 0ms">
      <h3 class="section-title">账号信息</h3>
      <div v-if="userInfo" class="info-grid">
        <div class="info-item">
          <span class="info-label">用户名</span>
          <span class="info-value">{{ userInfo.username }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">注册时间</span>
          <span class="info-value">{{ formatDateCN(userInfo.created_at) }}</span>
        </div>
      </div>
    </section>

    <!-- Data Management -->
    <section class="settings-section stagger-item" style="animation-delay: 80ms">
      <h3 class="section-title">数据管理</h3>
      <div class="action-list">
        <div class="action-item">
          <div class="action-info">
            <div class="action-title">导出全部数据</div>
            <div class="action-desc">导出所有旅行记录为 JSON 文件（不含照片）</div>
          </div>
          <button class="action-btn" @click="exportAll('json')">
            <el-icon><Document /></el-icon>
            <span>导出 JSON</span>
          </button>
        </div>
        <div class="action-divider"></div>
        <div class="action-item">
          <div class="action-info">
            <div class="action-title">导出数据含照片</div>
            <div class="action-desc">导出为 ZIP 压缩包，包含 JSON 数据和照片文件</div>
          </div>
          <button class="action-btn" @click="exportAll('zip')">
            <el-icon><FolderOpened /></el-icon>
            <span>导出 ZIP</span>
          </button>
        </div>
        <div class="action-divider"></div>
        <div class="action-item">
          <div class="action-info">
            <div class="action-title">导入数据</div>
            <div class="action-desc">从 JSON 文件导入旅行记录</div>
          </div>
          <label class="action-btn action-btn-outline" :class="{ loading: importLoading }">
            <el-icon v-if="!importLoading"><Upload /></el-icon>
            <span v-if="importLoading">导入中...</span>
            <span v-else>选择文件</span>
            <input type="file" accept=".json" @change="handleImport" style="display: none" />
          </label>
        </div>
      </div>
    </section>

    <!-- Appearance -->
    <section class="settings-section stagger-item" style="animation-delay: 160ms">
      <h3 class="section-title">外观设置</h3>
      <div class="theme-options">
        <div
          v-for="option in [
            { value: 'auto', label: '跟随系统', desc: '自动匹配系统深色/浅色模式', icon: 'Monitor' },
            { value: 'light', label: '浅色模式', desc: '始终使用浅色主题', icon: 'Sunny' },
            { value: 'dark', label: '深色模式', desc: '始终使用深色主题', icon: 'Moon' },
          ]"
          :key="option.value"
          :class="['theme-option', { active: themeMode === option.value }]"
          @click="handleThemeChange(option.value)"
        >
          <span class="theme-icon">
            <el-icon><component :is="option.icon" /></el-icon>
          </span>
          <div class="theme-info">
            <div class="theme-label">{{ option.label }}</div>
            <div class="theme-desc">{{ option.desc }}</div>
          </div>
          <div class="theme-check">
            <el-icon v-if="themeMode === option.value"><CircleCheck /></el-icon>
          </div>
        </div>
      </div>
    </section>

    <!-- Change Password -->
    <section class="settings-section stagger-item" style="animation-delay: 240ms">
      <h3 class="section-title">修改密码</h3>
      <form class="password-form" @submit.prevent="handleChangePassword">
        <div class="form-group">
          <label class="form-label">当前密码</label>
          <input v-model="form.current_password" type="password" class="form-input" autocomplete="current-password" />
        </div>
        <div class="form-group">
          <label class="form-label">新密码</label>
          <input v-model="form.new_password" type="password" class="form-input" placeholder="至少6位" autocomplete="new-password" />
        </div>
        <div class="form-group">
          <label class="form-label">确认新密码</label>
          <input v-model="form.confirm_password" type="password" class="form-input" autocomplete="new-password" />
        </div>
        <button type="submit" class="submit-btn" :disabled="passwordLoading">
          <span v-if="passwordLoading" class="btn-loading"></span>
          <span v-else>修改密码</span>
        </button>
      </form>
    </section>

    <!-- About -->
    <section class="settings-section stagger-item" style="animation-delay: 320ms">
      <h3 class="section-title">关于</h3>
      <div class="about-grid">
        <div class="about-item">
          <span class="about-label">应用名称</span>
          <span class="about-value">旅行足迹地图</span>
        </div>
        <div class="about-item">
          <span class="about-label">版本</span>
          <span class="about-value">v1.0.0</span>
        </div>
        <div class="about-item">
          <span class="about-label">技术栈</span>
          <span class="about-value">Vue 3 + FastAPI + SQLite</span>
        </div>
        <div class="about-item">
          <span class="about-label">地图服务</span>
          <span class="about-value">高德地图 JS API v2.0</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 28px 24px;
}

.page-header {
  margin-bottom: 28px;
}

.page-title {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 700;
  color: var(--color-warm-gray-900);
}

/* Section */
.settings-section {
  background: var(--color-warm-white);
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-bottom: 16px;
}

.section-title {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-warm-gray-900);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-warm-gray-100);
}

/* Account Info */
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: 14px;
  color: var(--color-warm-gray-500);
}

.info-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-warm-gray-900);
}

/* Data Actions */
.action-list {
  display: flex;
  flex-direction: column;
}

.action-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  gap: 16px;
}

.action-divider {
  height: 1px;
  background: var(--color-warm-gray-100);
  margin: 4px 0;
}

.action-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-warm-gray-900);
  margin-bottom: 2px;
}

.action-desc {
  font-size: 13px;
  color: var(--color-warm-gray-500);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  background: var(--color-warm-white);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-warm-gray-700);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.action-btn:hover {
  border-color: var(--color-amber);
  color: var(--color-amber-dark);
}

.action-btn-outline {
  border-color: var(--color-amber);
  color: var(--color-amber-dark);
}

.action-btn-outline:hover {
  background: rgba(212, 168, 83, 0.08);
}

.action-btn.loading {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Theme Options */
.theme-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-option:hover {
  border-color: var(--color-amber-light);
}

.theme-option.active {
  border-color: var(--color-amber);
  background: rgba(212, 168, 83, 0.06);
}

.theme-icon {
  font-size: 20px;
  width: 32px;
  text-align: center;
}

.theme-info {
  flex: 1;
}

.theme-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-warm-gray-900);
  margin-bottom: 2px;
}

.theme-desc {
  font-size: 12px;
  color: var(--color-warm-gray-500);
}

.theme-check {
  width: 20px;
  text-align: center;
  font-size: 14px;
  color: var(--color-amber-dark);
  font-weight: 600;
}

/* Password Form */
.password-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  padding: 11px 14px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: 14px;
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
  box-shadow: 0 0 0 3px rgba(212, 168, 83, 0.12);
  background: var(--color-warm-white);
}

.submit-btn {
  padding: 11px 20px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-amber);
  color: white;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  align-self: flex-start;
}

.submit-btn:hover:not(:disabled) {
  background: var(--color-amber-dark);
  transform: translateY(-1px);
  box-shadow: var(--shadow-warm);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-loading {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* About */
.about-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.about-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.about-label {
  font-size: 14px;
  color: var(--color-warm-gray-500);
}

.about-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-warm-gray-900);
}

@media (max-width: 768px) {
  .settings-page {
    padding: 20px 16px;
  }

  .action-item {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .action-btn {
    align-self: flex-start;
  }
}
</style>
