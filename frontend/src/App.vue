<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useTheme } from './composables/useTheme'
import { searchAll } from './api/search'
import type { SearchResult } from './types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isDark, themeMode, setTheme } = useTheme()

const isSharePage = computed(() => route.path.startsWith('/share'))
const isLoginPage = computed(() => route.path === '/login')
const showNav = computed(() => !isLoginPage.value && !isSharePage.value)

const navItems = [
  { path: '/', label: '地图', icon: 'Location' },
  { path: '/trips', label: '旅行', icon: 'Suitcase' },
  { path: '/timeline', label: '时间线', icon: 'Calendar' },
  { path: '/stats', label: '统计', icon: 'DataAnalysis' },
]

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
const searchInputRef = ref<HTMLInputElement | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(showSearch, (val) => {
  if (val) {
    nextTick(() => searchInputRef.value?.focus())
  }
})

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  if (!searchQuery.value.trim()) {
    searchResults.value = null
    return
  }
  searchTimer = setTimeout(async () => {
    searchLoading.value = true
    try {
      const { data } = await searchAll(searchQuery.value.trim())
      searchResults.value = data
    } catch {
      searchResults.value = null
    } finally {
      searchLoading.value = false
    }
  }, 300)
}

function goToTrip(tripId: number) {
  router.push(`/trips/${tripId}`)
  closeSearch()
}


function toggleSearch() {
  if (showSearch.value) {
    closeSearch()
  } else {
    showSearch.value = true
  }
}

function closeSearch() {
  showSearch.value = false
  searchQuery.value = ''
  searchResults.value = null
}

function cycleTheme() {
  const modes = ['auto', 'light', 'dark']
  const nextIndex = (modes.indexOf(themeMode.value) + 1) % modes.length
  setTheme(modes[nextIndex])
}
</script>

<template>
  <div id="app-container">
    <!-- Desktop nav -->
    <header v-if="showNav" class="desktop-nav">
      <template v-if="!showSearch">
        <div class="nav-left">
          <span class="logo" @click="router.push('/')">旅行足迹</span>
          <nav class="nav-links">
            <router-link
              v-for="item in navItems"
              :key="item.path"
              :to="item.path"
              :class="['nav-link', { active: route.path === item.path }]"
            >
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </router-link>
          </nav>
        </div>
        <div class="nav-right">
          <button class="nav-btn theme-btn" @click="cycleTheme" :title="`当前: ${themeMode}`">
            <el-icon v-if="themeMode === 'dark'"><Moon /></el-icon>
            <el-icon v-else-if="themeMode === 'light'"><Sunny /></el-icon>
            <el-icon v-else><Refresh /></el-icon>
          </button>
          <button class="nav-btn search-btn" @click="toggleSearch">
            <el-icon><Search /></el-icon>
          </button>
          <button class="nav-btn" @click="goToSettings">
            <el-icon><Setting /></el-icon>
          </button>
          <button class="nav-btn nav-btn-logout" @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
          </button>
        </div>
      </template>

      <!-- Inline search bar -->
      <div v-else class="search-bar">
        <span class="search-icon">🔍</span>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          @input="onSearchInput"
          @keydown.escape="closeSearch"
          placeholder="搜索旅行、地点、城市..."
          class="search-input"
        />
        <button class="search-close" @click="closeSearch">✕</button>

        <!-- Results dropdown -->
        <div v-if="searchQuery.trim()" class="search-dropdown">
          <div v-if="searchLoading" class="search-status">搜索中...</div>
          <div v-else-if="searchResults">
            <div v-if="searchResults.trips.length === 0 && searchResults.locations.length === 0" class="search-status">
              没有找到匹配「{{ searchQuery.trim() }}」的结果
            </div>
            <template v-else>
              <div v-if="searchResults.trips.length > 0" class="search-group">
                <div class="search-group-title">旅行</div>
                <div
                  v-for="trip in searchResults.trips"
                  :key="'t'+trip.id"
                  class="search-item"
                  @click="goToTrip(trip.id)"
                >
                  <span class="search-item-icon">✈</span>
                  <div class="search-item-info">
                    <div class="search-item-name">{{ trip.title }}</div>
                    <div class="search-item-desc">{{ trip.start_date }} ~ {{ trip.end_date }}</div>
                  </div>
                </div>
              </div>
              <div v-if="searchResults.locations.length > 0" class="search-group">
                <div class="search-group-title">地点</div>
                <div
                  v-for="loc in searchResults.locations"
                  :key="'l'+loc.id"
                  class="search-item"
                  @click="goToTrip(loc.trip_id)"
                >
                  <span class="search-item-icon">📍</span>
                  <div class="search-item-info">
                    <div class="search-item-name">{{ loc.name }}</div>
                    <div class="search-item-desc">{{ loc.city }} · {{ loc.trip_title }}</div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </header>

    <!-- Mobile top bar -->
    <div v-if="showNav" class="mobile-top-bar">
      <template v-if="!showSearch">
        <span class="mobile-logo">旅行足迹</span>
        <div class="mobile-top-actions">
          <button class="mobile-action-btn" @click="cycleTheme" :title="`当前: ${themeMode}`">
            <el-icon v-if="themeMode === 'dark'"><Moon /></el-icon>
            <el-icon v-else-if="themeMode === 'light'"><Sunny /></el-icon>
            <el-icon v-else><Refresh /></el-icon>
          </button>
          <button class="mobile-action-btn" @click="toggleSearch">
            <el-icon><Search /></el-icon>
          </button>
          <button class="mobile-action-btn" @click="goToSettings">
            <el-icon><Setting /></el-icon>
          </button>
          <button class="mobile-action-btn" @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
          </button>
        </div>
      </template>
      <div v-else class="search-bar mobile-search-bar">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchQuery"
          @input="onSearchInput"
          @keydown.escape="closeSearch"
          placeholder="搜索旅行、地点..."
          class="search-input"
          autofocus
        />
        <button class="search-close" @click="closeSearch">✕</button>

        <div v-if="searchQuery.trim()" class="search-dropdown">
          <div v-if="searchLoading" class="search-status">搜索中...</div>
          <div v-else-if="searchResults">
            <div v-if="searchResults.trips.length === 0 && searchResults.locations.length === 0" class="search-status">
              没有找到匹配结果
            </div>
            <template v-else>
              <div v-if="searchResults.trips.length > 0" class="search-group">
                <div class="search-group-title">旅行</div>
                <div
                  v-for="trip in searchResults.trips"
                  :key="'mt'+trip.id"
                  class="search-item"
                  @click="goToTrip(trip.id)"
                >
                  <span class="search-item-icon">✈</span>
                  <div class="search-item-info">
                    <div class="search-item-name">{{ trip.title }}</div>
                    <div class="search-item-desc">{{ trip.start_date }} ~ {{ trip.end_date }}</div>
                  </div>
                </div>
              </div>
              <div v-if="searchResults.locations.length > 0" class="search-group">
                <div class="search-group-title">地点</div>
                <div
                  v-for="loc in searchResults.locations"
                  :key="'ml'+loc.id"
                  class="search-item"
                  @click="goToTrip(loc.trip_id)"
                >
                  <span class="search-item-icon">📍</span>
                  <div class="search-item-info">
                    <div class="search-item-name">{{ loc.name }}</div>
                    <div class="search-item-desc">{{ loc.city }} · {{ loc.trip_title }}</div>
                  </div>
                </div>
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

    <!-- Mobile bottom tab bar -->
    <nav v-if="showNav" class="mobile-tab-bar">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="['tab-item', { active: route.path === item.path }]"
      >
        <el-icon class="tab-icon"><component :is="item.icon" /></el-icon>
        <span class="tab-label">{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<style scoped>
/* ========== Desktop Nav ========== */
.desktop-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  height: 60px;
  background: var(--color-warm-white);
  border-bottom: 1px solid var(--color-warm-gray-100);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 32px;
}

.logo {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-warm-gray-900);
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: color 0.2s ease;
}

.logo:hover {
  color: var(--color-amber-dark);
}

.nav-links {
  display: flex;
  gap: 4px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-warm-gray-500);
  text-decoration: none;
  transition: all 0.2s ease;
}

.nav-link:hover {
  color: var(--color-warm-gray-900);
  background: var(--color-cream);
}

.nav-link.active {
  color: var(--color-amber-dark);
  background: rgba(212, 168, 83, 0.1);
  font-weight: 600;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-warm-gray-500);
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-btn .el-icon {
  font-size: 16px;
}

.nav-btn:hover {
  color: var(--color-warm-gray-900);
  background: var(--color-cream);
}

.nav-btn-logout:hover {
  color: var(--color-terracotta);
  background: rgba(196, 112, 75, 0.08);
}

/* ========== Mobile Top Bar ========== */
.mobile-top-bar {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--color-warm-white);
  border-bottom: 1px solid var(--color-warm-gray-100);
  position: sticky;
  top: 0;
  z-index: 100;
}

.mobile-logo {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-warm-gray-900);
  letter-spacing: 0.05em;
}

.mobile-top-actions {
  display: flex;
  gap: 4px;
}

.mobile-action-btn {
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-warm-gray-500);
  cursor: pointer;
}

.mobile-action-btn:active {
  background: var(--color-cream);
}

/* ========== Main Content ========== */
main {
  flex: 1;
  overflow: auto;
}

.no-header {
  padding: 0;
}

/* ========== Mobile Bottom Tab Bar ========== */
.mobile-tab-bar {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: var(--color-warm-white);
  border-top: 1px solid var(--color-warm-gray-100);
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-decoration: none;
  color: var(--color-warm-gray-500);
  font-size: 11px;
  transition: color 0.2s ease;
  position: relative;
}

.tab-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 24px;
  height: 2px;
  background: var(--color-amber);
  border-radius: 1px;
  transition: transform 0.25s ease;
}

.tab-item.active {
  color: var(--color-amber-dark);
}

.tab-item.active::before {
  transform: translateX(-50%) scaleX(1);
}

.tab-icon {
  font-size: 20px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-label {
  font-weight: 500;
  letter-spacing: 0.02em;
}

/* ========== Search ========== */
.search-btn {
  font-size: 16px;
  padding: 6px 10px;
}

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
  font-size: 16px;
  z-index: 1;
  pointer-events: none;
}

.search-bar .search-input {
  width: 100%;
  padding: 10px 40px 10px 40px;
  border: 1px solid var(--color-warm-gray-100, #E8E4DF);
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: var(--color-cream, #FDF8F0);
  color: var(--color-warm-gray-900, #2C2C2C);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.search-bar .search-input:focus {
  border-color: var(--color-amber, #D4A853);
  background: var(--color-warm-white, #FEFCF9);
  box-shadow: 0 0 0 3px rgba(212, 168, 83, 0.12), inset 0 1px 3px rgba(0, 0, 0, 0.04);
}

.search-bar .search-input::placeholder {
  color: var(--color-warm-gray-300, #C0B8AE);
}

.search-close {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  font-size: 16px;
  color: var(--color-warm-gray-400, #A89F95);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s;
}

.search-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--color-warm-gray-700, #5C5650);
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  max-height: 420px;
  overflow-y: auto;
  background: var(--color-warm-white, #FEFCF9);
  border: 1px solid var(--color-warm-gray-100, #E8E4DF);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06);
  z-index: 200;
}

.search-status {
  padding: 32px 20px;
  text-align: center;
  color: var(--color-warm-gray-400, #A89F95);
  font-size: 13px;
}

.search-group-title {
  padding: 10px 16px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-warm-gray-400, #A89F95);
  letter-spacing: 0.5px;
}

.search-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.search-item:hover {
  background: rgba(212, 168, 83, 0.08);
}

.search-item-icon {
  font-size: 18px;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.search-item-info {
  min-width: 0;
  flex: 1;
}

.search-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-warm-gray-900, #2C2C2C);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-item-desc {
  font-size: 12px;
  color: var(--color-warm-gray-400, #A89F95);
  margin-top: 2px;
}

/* ========== Responsive ========== */
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
    padding-bottom: 64px;
  }

  .mobile-search-bar {
    width: 100%;
  }

  .mobile-search-bar .search-dropdown {
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    border-radius: 0 0 12px 12px;
    max-height: calc(100vh - 56px - 64px);
  }
}
</style>
