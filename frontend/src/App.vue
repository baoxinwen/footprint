<script setup lang="ts">
import { computed, ref, nextTick, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useTheme } from './composables/useTheme'
import { searchAll } from './api/search'
import type { SearchResult } from './types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { themeMode, setTheme } = useTheme()

const isSharePage = computed(() => route.path.startsWith('/share'))
const isLoginPage = computed(() => route.path === '/login')
const showNav = computed(() => !isLoginPage.value && !isSharePage.value)

const navItems = [
  { path: '/', label: '地图', icon: 'Location', exact: true },
  { path: '/trips', label: '旅行', icon: 'Suitcase', exact: false },
  { path: '/timeline', label: '时间线', icon: 'Calendar', exact: false },
  { path: '/stats', label: '统计', icon: 'DataAnalysis', exact: false },
]

function isActive(path: string, exact: boolean) {
  return exact ? route.path === path : route.path.startsWith(path)
}

function handleLogout() {
  auth.logout()
}

function goToSettings() {
  router.push('/settings')
}

const searchQuery = ref('')
const searchResults = ref<SearchResult | null>(null)
const showSearch = ref(false)
const searchLoading = ref(false)
const desktopSearchInputRef = ref<HTMLInputElement | null>(null)
const mobileSearchInputRef = ref<HTMLInputElement | null>(null)
const desktopSearchButtonRef = ref<HTMLButtonElement | null>(null)
const mobileSearchButtonRef = ref<HTMLButtonElement | null>(null)
type SearchOrigin = 'desktop' | 'mobile'
let searchOrigin: SearchOrigin | null = null
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchController: AbortController | null = null
let searchRequestId = 0

watch(showSearch, (val) => {
  if (val) {
    nextTick(() => {
      const input = searchOrigin === 'mobile' ? mobileSearchInputRef.value : desktopSearchInputRef.value
      input?.focus()
    })
  }
})

function onSearchInput() {
  cancelPendingSearch()
  const query = searchQuery.value.trim()
  if (!query) {
    searchResults.value = null
    return
  }
  const requestId = searchRequestId
  searchTimer = setTimeout(async () => {
    searchTimer = null
    const controller = new AbortController()
    searchController = controller
    searchLoading.value = true
    try {
      const { data } = await searchAll(query, { signal: controller.signal })
      if (requestId === searchRequestId && !controller.signal.aborted) {
        searchResults.value = data
      }
    } catch {
      if (requestId === searchRequestId && !controller.signal.aborted) {
        searchResults.value = null
      }
    } finally {
      if (requestId === searchRequestId) {
        searchLoading.value = false
        if (searchController === controller) searchController = null
      }
    }
  }, 300)
}

function cancelPendingSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  searchController?.abort()
  searchController = null
  searchRequestId += 1
  searchLoading.value = false
}

function goToTrip(tripId: number) {
  router.push(`/trips/${tripId}`)
  closeSearch()
}


function toggleSearch(origin: SearchOrigin) {
  if (showSearch.value) {
    closeSearch()
  } else {
    searchOrigin = origin
    showSearch.value = true
  }
}

function closeSearch() {
  const origin = searchOrigin
  cancelPendingSearch()
  showSearch.value = false
  searchQuery.value = ''
  searchResults.value = null
  nextTick(() => {
    const trigger = origin === 'mobile' ? mobileSearchButtonRef.value : desktopSearchButtonRef.value
    trigger?.focus()
    if (searchOrigin === origin) searchOrigin = null
  })
}

onUnmounted(cancelPendingSearch)

function cycleTheme() {
  const modes = ['auto', 'light', 'dark']
  const nextIndex = (modes.indexOf(themeMode.value) + 1) % modes.length
  setTheme(modes[nextIndex])
}
</script>

<template>
  <div id="app-container">
    <!-- 桌面导航 -->
    <header v-if="showNav" class="desktop-nav">
      <template v-if="!showSearch">
        <div class="nav-left">
          <button type="button" class="logo" @click="router.push('/')">旅行足迹</button>
          <span class="nav-divider" aria-hidden="true"></span>
          <nav class="nav-links" aria-label="主导航">
            <router-link
              v-for="item in navItems"
              :key="item.path"
              :to="item.path"
              :class="['nav-link', { active: isActive(item.path, item.exact) }]"
            >
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </router-link>
          </nav>
        </div>
        <div class="nav-right">
          <button class="nav-btn theme-btn" aria-label="切换主题" @click="cycleTheme" :title="`主题：${themeMode === 'auto' ? '跟随系统' : themeMode === 'light' ? '浅色' : '深色'}`">
            <el-icon v-if="themeMode === 'dark'"><Moon /></el-icon>
            <el-icon v-else-if="themeMode === 'light'"><Sunny /></el-icon>
            <el-icon v-else><Refresh /></el-icon>
          </button>
          <button ref="desktopSearchButtonRef" class="nav-btn search-btn" aria-label="打开搜索" @click="toggleSearch('desktop')">
            <el-icon><Search /></el-icon>
          </button>
          <button class="nav-btn" aria-label="打开设置" @click="goToSettings">
            <el-icon><Setting /></el-icon>
          </button>
          <button class="nav-btn nav-btn-logout" aria-label="退出登录" @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
          </button>
        </div>
      </template>

      <!-- 内联搜索 -->
      <div v-else class="search-bar">
        <el-icon class="search-icon"><Search /></el-icon>
        <input
          ref="desktopSearchInputRef"
          v-model="searchQuery"
          @input="onSearchInput"
          @keydown.escape="closeSearch"
          placeholder="搜索旅行、地点、城市..."
          class="search-input"
        />
        <button class="search-close" aria-label="关闭搜索" @click="closeSearch"><el-icon><Close /></el-icon></button>

        <div v-if="searchQuery.trim()" class="search-dropdown">
          <div v-if="searchLoading" class="search-status">搜索中...</div>
          <div v-else-if="searchResults">
            <div v-if="searchResults.trips.length === 0 && searchResults.locations.length === 0" class="search-status">
              没有找到匹配「{{ searchQuery.trim() }}」的结果
            </div>
            <template v-else>
              <div v-if="searchResults.trips.length > 0" class="search-group">
                <div class="search-group-title">旅行</div>
                <button
                  v-for="trip in searchResults.trips"
                  :key="'t'+trip.id"
                  type="button"
                  class="search-item"
                  @click="goToTrip(trip.id)"
                >
                  <span class="search-item-icon"><el-icon><Suitcase /></el-icon></span>
                  <div class="search-item-info">
                    <div class="search-item-name">{{ trip.title }}</div>
                    <div class="search-item-desc">{{ trip.start_date }} ~ {{ trip.end_date }}</div>
                  </div>
                </button>
              </div>
              <div v-if="searchResults.locations.length > 0" class="search-group">
                <div class="search-group-title">地点</div>
                <button
                  v-for="loc in searchResults.locations"
                  :key="'l'+loc.id"
                  type="button"
                  class="search-item"
                  @click="goToTrip(loc.trip_id)"
                >
                  <span class="search-item-icon"><el-icon><Location /></el-icon></span>
                  <div class="search-item-info">
                    <div class="search-item-name">{{ loc.name }}</div>
                    <div class="search-item-desc">{{ loc.city }} · {{ loc.trip_title }}</div>
                  </div>
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </header>

    <!-- 移动端顶栏 -->
    <div v-if="showNav" class="mobile-top-bar">
      <template v-if="!showSearch">
        <span class="mobile-logo">旅行足迹</span>
        <div class="mobile-top-actions">
          <button class="mobile-action-btn" aria-label="切换主题" @click="cycleTheme">
            <el-icon v-if="themeMode === 'dark'"><Moon /></el-icon>
            <el-icon v-else-if="themeMode === 'light'"><Sunny /></el-icon>
            <el-icon v-else><Refresh /></el-icon>
          </button>
          <button ref="mobileSearchButtonRef" class="mobile-action-btn" aria-label="打开搜索" @click="toggleSearch('mobile')">
            <el-icon><Search /></el-icon>
          </button>
          <button class="mobile-action-btn" aria-label="打开设置" @click="goToSettings">
            <el-icon><Setting /></el-icon>
          </button>
          <button class="mobile-action-btn" aria-label="退出登录" @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
          </button>
        </div>
      </template>
      <div v-else class="search-bar mobile-search-bar">
        <el-icon class="search-icon"><Search /></el-icon>
        <input
          ref="mobileSearchInputRef"
          v-model="searchQuery"
          @input="onSearchInput"
          @keydown.escape="closeSearch"
          placeholder="搜索旅行、地点..."
          class="search-input"
        />
        <button class="search-close" aria-label="关闭搜索" @click="closeSearch"><el-icon><Close /></el-icon></button>

        <div v-if="searchQuery.trim()" class="search-dropdown">
          <div v-if="searchLoading" class="search-status">搜索中...</div>
          <div v-else-if="searchResults">
            <div v-if="searchResults.trips.length === 0 && searchResults.locations.length === 0" class="search-status">
              没有找到匹配结果
            </div>
            <template v-else>
              <div v-if="searchResults.trips.length > 0" class="search-group">
                <div class="search-group-title">旅行</div>
                <button
                  v-for="trip in searchResults.trips"
                  :key="'mt'+trip.id"
                  type="button"
                  class="search-item"
                  @click="goToTrip(trip.id)"
                >
                  <span class="search-item-icon"><el-icon><Suitcase /></el-icon></span>
                  <div class="search-item-info">
                    <div class="search-item-name">{{ trip.title }}</div>
                    <div class="search-item-desc">{{ trip.start_date }} ~ {{ trip.end_date }}</div>
                  </div>
                </button>
              </div>
              <div v-if="searchResults.locations.length > 0" class="search-group">
                <div class="search-group-title">地点</div>
                <button
                  v-for="loc in searchResults.locations"
                  :key="'ml'+loc.id"
                  type="button"
                  class="search-item"
                  @click="goToTrip(loc.trip_id)"
                >
                  <span class="search-item-icon"><el-icon><Location /></el-icon></span>
                  <div class="search-item-info">
                    <div class="search-item-name">{{ loc.name }}</div>
                    <div class="search-item-desc">{{ loc.city }} · {{ loc.trip_title }}</div>
                  </div>
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <main :class="{ 'no-header': !showNav }">
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 移动端底部标签栏 -->
    <nav v-if="showNav" class="mobile-tab-bar">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="['tab-item', { active: isActive(item.path, item.exact) }]"
      >
        <el-icon class="tab-icon"><component :is="item.icon" /></el-icon>
        <span class="tab-label">{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<style scoped>
/* ========== 桌面导航 ========== */
.desktop-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
  min-height: 64px;
  height: 64px;
  padding-inline: clamp(20px, 4vw, 56px);
  background: color-mix(in srgb, var(--color-surface) 92%, transparent);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  min-width: 0;
}

.logo {
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 700;
  color: var(--color-ink);
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--dur-base) var(--ease-out);
}

.logo:hover {
  color: var(--color-primary);
}

.nav-divider {
  width: 1px;
  height: 20px;
  background: var(--color-border-strong);
}

.nav-links {
  display: flex;
  gap: 6px;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-ink-secondary);
  text-decoration: none;
  transition: color var(--dur-base) var(--ease-out),
    background-color var(--dur-base) var(--ease-out);
}

.nav-link .el-icon {
  font-size: 16px;
}

.nav-link:hover {
  color: var(--color-ink);
  background: var(--color-surface-muted);
}

.nav-link.active {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  font-weight: 600;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--color-ink-secondary);
  cursor: pointer;
  transition: color var(--dur-base) var(--ease-out),
    background-color var(--dur-base) var(--ease-out);
}

.nav-btn .el-icon {
  font-size: 18px;
}

.nav-btn:hover {
  color: var(--color-ink);
  background: var(--color-surface-muted);
}

.nav-btn-logout:hover {
  color: var(--color-danger);
  background: var(--color-danger-soft);
}

/* ========== 移动端顶栏 ========== */
.mobile-top-bar {
  display: none;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  padding: 8px 12px 8px 16px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.mobile-logo {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 700;
  color: var(--color-ink);
  letter-spacing: 0.06em;
}

.mobile-top-actions {
  display: flex;
  gap: 2px;
}

.mobile-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--color-ink-secondary);
  cursor: pointer;
}

.mobile-action-btn:active {
  background: var(--color-surface-muted);
  color: var(--color-ink);
}

/* ========== 主内容 ========== */
main {
  flex: 1;
  overflow: auto;
}

/* ========== 移动端底部标签栏 ========== */
.mobile-tab-bar {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(64px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: color-mix(in srgb, var(--color-surface) 96%, transparent);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--color-border);
  z-index: 100;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  text-decoration: none;
  color: var(--color-ink-muted);
  font-size: 11px;
  transition: color var(--dur-base) var(--ease-out);
  position: relative;
}

.tab-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 28px;
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: var(--color-primary);
  transition: transform var(--dur-base) var(--ease-out);
}

.tab-item.active {
  color: var(--color-primary);
  font-weight: 600;
}

.tab-item.active::before {
  transform: translateX(-50%) scaleX(1);
}

.tab-icon {
  font-size: 21px;
  line-height: 1;
  display: flex;
}

.tab-label {
  letter-spacing: 0.04em;
}

/* ========== 搜索 ========== */
.search-bar {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 14px;
  font-size: 17px;
  z-index: 1;
  color: var(--color-ink-muted);
  pointer-events: none;
}

.search-bar .search-input {
  width: 100%;
  min-height: 44px;
  padding: 10px 48px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 14px;
  font-family: var(--font-sans);
  outline: none;
  background: var(--color-canvas);
  color: var(--color-ink);
  transition: border-color var(--dur-base) ease,
    background-color var(--dur-base) ease,
    box-shadow var(--dur-base) ease;
}

.search-bar .search-input:focus {
  border-color: var(--color-primary);
  background: var(--color-surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 14%, transparent);
}

.search-bar .search-input::placeholder {
  color: var(--color-ink-muted);
}

.search-close {
  position: absolute;
  right: 2px;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  font-size: 16px;
  color: var(--color-ink-muted);
  cursor: pointer;
  border-radius: 999px;
  transition: color var(--dur-fast) ease, background-color var(--dur-fast) ease;
}

.search-close:hover {
  background: var(--color-surface-muted);
  color: var(--color-ink-secondary);
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  right: 0;
  max-height: 440px;
  overflow-y: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-elevated);
  z-index: 200;
}

.search-status {
  padding: 36px 20px;
  text-align: center;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.search-group-title {
  padding: 14px 18px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-ink-muted);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.search-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 10px 18px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dur-fast) ease;
}

.search-item:hover {
  background: var(--color-primary-soft);
}

.search-item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
  background: var(--color-primary-soft);
}

.search-item-icon {
  display: inline-flex;
  font-size: 18px;
  color: var(--color-primary);
  flex-shrink: 0;
  width: 24px;
  justify-content: center;
}

.search-item-info {
  min-width: 0;
  flex: 1;
}

.search-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-item-desc {
  font-size: 12px;
  color: var(--color-ink-muted);
  margin-top: 2px;
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .desktop-nav {
    display: none;
  }

  .mobile-top-bar {
    display: flex;
  }

  .mobile-tab-bar {
    display: flex;
  }

  main {
    padding-bottom: calc(64px + env(safe-area-inset-bottom));
  }

  .mobile-search-bar {
    width: 100%;
  }

  .mobile-search-bar .search-dropdown {
    position: fixed;
    top: 60px;
    left: 0;
    right: 0;
    border-radius: 0;
    max-height: calc(100dvh - 60px - 64px - env(safe-area-inset-bottom));
  }
}
</style>
