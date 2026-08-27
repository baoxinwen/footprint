<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { changePassword } from '../api/auth'
import { getShares, revokeShare, rotateShare } from '../api/shares'
import request from '../api/request'
import { useAuthStore } from '../stores/auth'
import { useTheme } from '../composables/useTheme'
import { formatDateCN } from '../utils/format'
import { downloadBlob, scrollToSection } from '../utils/dom'
import type { ShareListItem } from '../types'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CopyDocument,
  Delete,
  Document,
  FolderOpened,
  Link,
  RefreshRight,
  Upload,
} from '@element-plus/icons-vue'

const auth = useAuthStore()
const { themeMode, setTheme } = useTheme()

const userInfo = ref<{ id: number; username: string; created_at: string } | null>(null)
const form = ref({ current_password: '', new_password: '', confirm_password: '' })
const passwordLoading = ref(false)
const importLoading = ref(false)
const shares = ref<ShareListItem[]>([])
const sharesLoading = ref(false)
const sharesError = ref('')
const shareActions = ref<Record<string, 'rotate' | 'revoke' | undefined>>({})

async function loadAccount() {
  try {
    const { data } = await request.get('/account/info')
    userInfo.value = data
  } catch {
    ElMessage.error('加载账号信息失败')
  }
}

async function loadShares() {
  sharesLoading.value = true
  sharesError.value = ''
  try {
    const { data } = await getShares()
    shares.value = data
  } catch {
    sharesError.value = '分享链接加载失败，请检查网络后重试'
  } finally {
    sharesLoading.value = false
  }
}

onMounted(() => {
  loadAccount()
  loadShares()
})

function absoluteShareUrl(url: string) {
  return new URL(url, window.location.origin).toString()
}

function isShareExpired(share: ShareListItem) {
  return new Date(share.expires_at).getTime() <= Date.now()
}

async function copyShareLink(share: ShareListItem) {
  try {
    await navigator.clipboard.writeText(absoluteShareUrl(share.url))
    ElMessage.success('分享链接已复制')
  } catch {
    ElMessage.error('复制分享链接失败，请检查浏览器权限')
  }
}

async function handleRotateShare(share: ShareListItem) {
  try {
    await ElMessageBox.confirm(
      '轮换后旧链接将立即失效，已经收到旧链接的人将无法继续查看。',
      '轮换分享链接',
      { type: 'warning', confirmButtonText: '确认轮换', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  shareActions.value[share.token] = 'rotate'
  try {
    const { data } = await rotateShare(share.trip_id)
    shares.value = shares.value.map((item) => (
      item.token === share.token ? { ...item, ...data } : item
    ))
    ElMessage.success('分享链接已轮换，旧链接立即失效')
  } catch {
    ElMessage.error('轮换分享链接失败，请稍后重试')
  } finally {
    delete shareActions.value[share.token]
  }
}

async function handleRevokeShare(share: ShareListItem) {
  try {
    await ElMessageBox.confirm(
      '撤销后此链接将立即失效，且无法恢复。',
      '撤销分享链接',
      { type: 'warning', confirmButtonText: '确认撤销', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  shareActions.value[share.token] = 'revoke'
  try {
    await revokeShare(share.token)
    shares.value = shares.value.filter((item) => item.token !== share.token)
    ElMessage.success('分享链接已撤销')
  } catch {
    ElMessage.error('撤销分享链接失败，请稍后重试')
  } finally {
    delete shareActions.value[share.token]
  }
}

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
    await changePassword(form.value.current_password, form.value.new_password, form.value.confirm_password)
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

const exportingFormat = ref<'' | 'json' | 'zip'>('')

async function exportAll(format: 'json' | 'zip') {
  if (exportingFormat.value) return // 防止重复触发全量导出
  const url = format === 'json' ? '/account/export/all' : '/account/export/all-with-photos'
  const filename = format === 'json' ? '足迹数据备份.json' : '足迹数据备份.zip'
  exportingFormat.value = format
  try {
    const response = await request.get(url, { responseType: 'blob' })
    downloadBlob(new Blob([response.data]), filename)
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exportingFormat.value = ''
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

/* 锚点目录 */
const railItems = [
  { id: 'sec-account', label: '账号' },
  { id: 'sec-shares', label: '分享链接' },
  { id: 'sec-data', label: '数据' },
  { id: 'sec-appearance', label: '外观' },
  { id: 'sec-password', label: '安全' },
  { id: 'sec-about', label: '关于' },
]


</script>

<template>
  <div class="settings-page">
    <header class="page-header">
      <p class="page-kicker">偏好与数据</p>
      <h2 class="page-title">设置</h2>
      <p class="page-desc">管理账号、分享链接、数据备份与外观</p>
    </header>

    <div class="settings-layout">
      <!-- 锚点目录 -->
      <aside class="section-rail" aria-label="设置目录">
        <button
          v-for="item in railItems"
          :key="item.id"
          type="button"
          @click="scrollToSection(item.id)"
        >
          {{ item.label }}
        </button>
      </aside>

      <div class="settings-content">
        <!-- 账号信息 -->
        <section id="sec-account" class="settings-section">
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

        <!-- 分享链接 -->
        <section id="sec-shares" class="settings-section">
          <div class="section-heading">
            <div>
              <h3 class="section-title section-title-compact">分享链接</h3>
              <p class="section-intro">查看并管理已创建的旅行分享。轮换或撤销会让旧链接立即失效。</p>
            </div>
            <el-icon class="section-heading-icon"><Link /></el-icon>
          </div>

          <div v-if="sharesLoading" class="share-state" aria-live="polite">正在加载分享链接...</div>
          <div v-else-if="sharesError" class="share-state share-state-error" role="alert">
            <span>{{ sharesError }}</span>
            <button type="button" class="text-action" data-testid="retry-shares" @click="loadShares">重试</button>
          </div>
          <div v-else-if="shares.length === 0" class="share-state share-state-empty">
            <p>暂无有效的分享链接</p>
            <p class="share-state-hint">在旅行详情页点击「分享」按钮即可创建，链接 30 天内有效</p>
          </div>
          <div v-else class="share-list">
            <article v-for="share in shares" :key="share.token" class="share-item">
              <div class="share-summary">
                <div class="share-title-row">
                  <strong>{{ share.trip_title }}</strong>
                  <span :class="['share-status', { expired: isShareExpired(share) }]">
                    {{ isShareExpired(share) ? '已过期' : '有效' }}
                  </span>
                </div>
                <div class="share-url" :title="absoluteShareUrl(share.url)">{{ absoluteShareUrl(share.url) }}</div>
                <div class="share-expiry">有效期至 {{ formatDateCN(share.expires_at) }}</div>
              </div>
              <div class="share-actions">
                <button
                  type="button"
                  class="share-action-button"
                  :data-testid="`copy-share-${share.token}`"
                  :aria-label="`复制${share.trip_title}的分享链接`"
                  @click="copyShareLink(share)"
                >
                  <el-icon><CopyDocument /></el-icon>
                  <span>复制链接</span>
                </button>
                <button
                  type="button"
                  class="share-action-button"
                  :data-testid="`rotate-share-${share.token}`"
                  :disabled="Boolean(shareActions[share.token])"
                  :aria-label="`轮换${share.trip_title}的分享链接`"
                  @click="handleRotateShare(share)"
                >
                  <el-icon><RefreshRight /></el-icon>
                  <span>{{ shareActions[share.token] === 'rotate' ? '轮换中...' : '轮换' }}</span>
                </button>
                <button
                  type="button"
                  class="share-action-button share-action-danger"
                  :data-testid="`revoke-share-${share.token}`"
                  :disabled="Boolean(shareActions[share.token])"
                  :aria-label="`撤销${share.trip_title}的分享链接`"
                  @click="handleRevokeShare(share)"
                >
                  <el-icon><Delete /></el-icon>
                  <span>{{ shareActions[share.token] === 'revoke' ? '撤销中...' : '撤销' }}</span>
                </button>
              </div>
            </article>
          </div>
        </section>

        <!-- 数据管理 -->
        <section id="sec-data" class="settings-section">
          <h3 class="section-title">数据管理</h3>
          <div class="action-list">
            <div class="action-item">
              <div class="action-info">
                <div class="action-title">导出全部数据</div>
                <div class="action-desc">导出所有旅行记录为 JSON 文件（不含照片）</div>
              </div>
              <button class="action-btn" :disabled="exportingFormat !== ''" @click="exportAll('json')">
                <el-icon><Document /></el-icon>
                <span>{{ exportingFormat === 'json' ? '导出中…' : '导出 JSON' }}</span>
              </button>
            </div>
            <div class="action-divider"></div>
            <div class="action-item">
              <div class="action-info">
                <div class="action-title">导出数据含照片</div>
                <div class="action-desc">导出为 ZIP 压缩包，包含 JSON 数据和照片文件</div>
              </div>
              <button class="action-btn" :disabled="exportingFormat !== ''" @click="exportAll('zip')">
                <el-icon><FolderOpened /></el-icon>
                <span>{{ exportingFormat === 'zip' ? '打包中…' : '导出 ZIP' }}</span>
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

        <!-- 外观设置 -->
        <section id="sec-appearance" class="settings-section">
          <h3 class="section-title">外观设置</h3>
          <div class="theme-options">
            <label
              v-for="option in [
                { value: 'auto', label: '跟随系统', desc: '自动匹配系统深色/浅色模式', icon: 'Monitor' },
                { value: 'light', label: '浅色模式', desc: '始终使用浅色主题', icon: 'Sunny' },
                { value: 'dark', label: '深色模式', desc: '始终使用深色主题', icon: 'Moon' },
              ]"
              :key="option.value"
              :class="['theme-option', { active: themeMode === option.value }]"
            >
              <span class="theme-icon">
                <el-icon><component :is="option.icon" /></el-icon>
              </span>
              <div class="theme-info">
                <div class="theme-label">{{ option.label }}</div>
                <div class="theme-desc">{{ option.desc }}</div>
              </div>
              <input
                class="theme-radio"
                type="radio"
                name="theme"
                :value="option.value"
                :checked="themeMode === option.value"
                @change="handleThemeChange(option.value)"
              />
            </label>
          </div>
        </section>

        <!-- 修改密码 -->
        <section id="sec-password" class="settings-section">
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

        <!-- 关于 -->
        <section id="sec-about" class="settings-section">
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
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--space-2xl) clamp(16px, 3vw, 40px) var(--space-3xl);
}

/* ========== 页头 ========== */
.page-header {
  padding-bottom: var(--space-lg);
  margin-bottom: var(--space-xl);
  border-bottom: 1px solid var(--color-border);
}

.page-kicker {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.22em;
  color: var(--color-accent);
  margin-bottom: var(--space-sm);
}

.page-title {
  font-family: var(--font-serif);
  font-size: var(--text-2xl);
  line-height: var(--lh-2xl);
  font-weight: 700;
}

.page-desc {
  margin-top: var(--space-sm);
  font-size: var(--text-base);
  color: var(--color-ink-secondary);
}

/* ========== 双栏布局 ========== */
.settings-layout {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  gap: var(--space-2xl);
  align-items: start;
}

.section-rail {
  position: sticky;
  top: 88px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-rail button {
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-left: 2px solid var(--color-border);
  border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
  background: transparent;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease, background-color var(--dur-fast) ease;
}

.section-rail button:hover {
  color: var(--color-ink);
  border-left-color: var(--color-ink-muted);
  background: var(--color-surface-muted);
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  max-width: 760px;
}

/* ========== 分节卡片 ========== */
.settings-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  scroll-margin-top: 88px;
}

.section-title {
  font-family: var(--font-serif);
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--color-ink);
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  padding-bottom: var(--space-md);
  margin-bottom: var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.section-title-compact {
  margin-bottom: 4px;
  padding-bottom: 0;
  border-bottom: 0;
}

.section-intro {
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}

.section-heading-icon {
  font-size: 20px;
  color: var(--color-primary);
  flex-shrink: 0;
}

/* 账号信息 */
.info-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.info-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
}

.info-label {
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}

.info-value {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-ink);
}

/* 分享链接 */
.share-state {
  padding: var(--space-lg);
  text-align: center;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.share-state-error {
  color: var(--color-danger);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
}

.share-state-empty p {
  margin: 0;
}

.share-state-hint {
  margin-top: 6px !important;
  font-size: var(--text-xs) !important;
  color: var(--color-ink-muted) !important;
}

.text-action {
  border: 0;
  background: none;
  color: var(--color-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.share-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.share-item {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: var(--space-lg);
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-canvas);
  flex-wrap: wrap;
}

.share-summary {
  min-width: 0;
  flex: 1;
}

.share-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.share-title-row strong {
  font-size: var(--text-base);
  color: var(--color-ink);
}

.share-status {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: var(--text-xs);
  font-weight: 500;
}

.share-status.expired {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.share-url {
  margin-top: 6px;
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, monospace;
}

.share-expiry {
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
}

.share-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
}

.share-action-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease, background-color var(--dur-fast) ease;
}

.share-action-button:hover:not(:disabled) {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.share-action-button:disabled {
  opacity: 0.5;
  cursor: wait;
}

.share-action-danger:hover:not(:disabled) {
  color: var(--color-danger);
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
}

/* 数据管理 */
.action-list {
  display: flex;
  flex-direction: column;
}

.action-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
  padding: var(--space-md) 0;
}

.action-divider {
  height: 1px;
  background: var(--color-border);
}

.action-title {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-ink);
}

.action-desc {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 18px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease, background-color var(--dur-fast) ease;
  flex-shrink: 0;
}

.action-btn:hover:not(:disabled) {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

/* 外观设置 */
.theme-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
}

.theme-option {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color var(--dur-fast) ease, background-color var(--dur-fast) ease, box-shadow var(--dur-fast) ease;
}

.theme-option:hover {
  border-color: var(--color-primary);
}

.theme-option.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: 0 0 0 1px var(--color-primary) inset;
}

.theme-icon {
  display: inline-flex;
  font-size: 20px;
  color: var(--color-ink-secondary);
}

.theme-option.active .theme-icon {
  color: var(--color-primary);
}

.theme-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
}

.theme-desc {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
}

.theme-radio {
  margin-left: auto;
  accent-color: var(--color-primary);
}

/* 修改密码 */
.password-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  max-width: 420px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink-secondary);
}

.form-input {
  height: 42px;
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

.submit-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 26px;
  border: 0;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--dur-base) ease, box-shadow var(--dur-base) ease;
}

.submit-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
  box-shadow: var(--shadow-primary);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.btn-loading {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb, var(--color-on-primary) 40%, transparent);
  border-top-color: var(--color-on-primary);
  border-radius: 999px;
  animation: btnSpin 0.7s linear infinite;
}

@keyframes btnSpin {
  to { transform: rotate(360deg); }
}

/* 关于 */
.about-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md) var(--space-xl);
}

.about-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.about-label {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  letter-spacing: 0.08em;
}

.about-value {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink);
}

/* ========== 响应式 ========== */
@media (max-width: 900px) {
  .settings-layout {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .section-rail {
    display: none;
  }

  .theme-options {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .settings-page {
    padding: var(--space-lg) var(--space-md) var(--space-2xl);
  }

  .page-title {
    font-size: var(--text-xl);
    line-height: var(--lh-xl);
  }

  .share-actions {
    width: 100%;
  }
}
</style>
