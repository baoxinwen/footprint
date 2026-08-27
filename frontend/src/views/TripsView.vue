<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getTrips, getTripCities, getTripYears } from '../api/trips'
import { coverFallbackText, durationDays, formatDateRange } from '../utils/format'
import EmptyState from '../components/EmptyState.vue'
import TripCover from '../components/TripCover.vue'
import SkeletonList from '../components/SkeletonList.vue'
import type { Trip } from '../types'
import { ArrowRight, Close, Filter, Plus, Search, SortDown, SortUp } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const PAGE_SIZE = 20
const trips = ref<Trip[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadError = ref(false)
const sortBy = ref('date')
const order = ref('desc')

// Filters
const search = ref('')
const filterYear = ref<number | null>(null)
const filterMonth = ref<number | null>(null)
const filterCity = ref('')
const filterDateFrom = ref('')
const filterDateTo = ref('')
const showFilters = ref(false)

// Filter options
const availableCities = ref<string[]>([])
const availableYears = ref<number[]>([])

const monthOptions = [
  { value: 1, label: '1月' }, { value: 2, label: '2月' }, { value: 3, label: '3月' },
  { value: 4, label: '4月' }, { value: 5, label: '5月' }, { value: 6, label: '6月' },
  { value: 7, label: '7月' }, { value: 8, label: '8月' }, { value: 9, label: '9月' },
  { value: 10, label: '10月' }, { value: 11, label: '11月' }, { value: 12, label: '12月' },
]

const activeFilterCount = computed(() => {
  let count = 0
  if (filterYear.value) count++
  if (filterMonth.value) count++
  if (filterCity.value) count++
  if (filterDateFrom.value) count++
  if (filterDateTo.value) count++
  return count
})

async function loadFilterOptions() {
  try {
    const [citiesRes, yearsRes] = await Promise.all([getTripCities(), getTripYears()])
    availableCities.value = citiesRes.data
    availableYears.value = yearsRes.data
  } catch {
    console.error('加载筛选选项失败')
  }
}

// 响应序号守卫：快速连续切换筛选/排序时，慢的旧响应不得覆盖新结果
let loadSeq = 0

async function loadTrips() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = false
  try {
    const { data } = await getTrips({
      sort_by: sortBy.value,
      order: order.value,
      search: search.value,
      year: filterYear.value || undefined,
      month: filterMonth.value || undefined,
      city: filterCity.value || undefined,
      date_from: filterDateFrom.value || undefined,
      date_to: filterDateTo.value || undefined,
      page: page.value,
      page_size: PAGE_SIZE,
    })
    if (seq !== loadSeq) return
    trips.value = data.items
    total.value = data.total
  } catch {
    if (seq !== loadSeq) return
    loadError.value = true
    console.error('加载旅行列表失败')
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

onMounted(() => {
  // 从 URL query 初始化筛选条件
  if (route.query.city) search.value = route.query.city as string
  const queryYear = Number(route.query.year)
  if (Number.isFinite(queryYear) && queryYear > 0) filterYear.value = queryYear

  loadFilterOptions()
  loadTrips()
})

watch([sortBy, order], () => { page.value = 1; loadTrips() })

function handleSearch() {
  page.value = 1
  loadTrips()
}

function handleFilterChange() {
  page.value = 1
  loadTrips()
}

function clearFilters() {
  search.value = ''
  filterYear.value = null
  filterMonth.value = null
  filterCity.value = ''
  filterDateFrom.value = ''
  filterDateTo.value = ''
  page.value = 1
  loadTrips()
}

function goToDetail(id: number) {
  router.push(`/trips/${id}`)
}

function goToNew() {
  router.push('/trips/new')
}

function durationLabel(start: string, end: string) {
  const days = durationDays(start, end)
  return days === null ? '—' : `${days}天`
}


</script>

<template>
  <main class="trips-page">
    <header class="page-header">
      <div class="header-left">
        <p class="page-kicker">旅行档案</p>
        <div class="title-row">
          <h1 class="page-title">我的旅行</h1>
          <span v-if="total > 0" class="trip-count">共 {{ total }} 次</span>
        </div>
      </div>
      <button type="button" class="create-btn" @click="goToNew">
        <el-icon aria-hidden="true"><Plus /></el-icon>
        <span>新建旅行</span>
      </button>
    </header>

    <section class="toolbar" aria-label="搜索和筛选旅行">
      <div class="search-box">
        <el-icon class="search-icon" aria-hidden="true"><Search /></el-icon>
        <input
          v-model="search"
          class="search-input"
          placeholder="搜索标题、描述、城市..."
          aria-label="搜索旅行"
          @keyup.enter="handleSearch"
        />
        <button
          v-if="search"
          type="button"
          class="icon-btn search-clear"
          aria-label="清除搜索"
          @click="search = ''; handleSearch()"
        >
          <el-icon aria-hidden="true"><Close /></el-icon>
        </button>
      </div>
      <button
        type="button"
        :class="['filter-toggle', { active: showFilters || activeFilterCount > 0 }]"
        :aria-expanded="showFilters"
        aria-controls="trip-filter-panel"
        @click="showFilters = !showFilters"
      >
        <el-icon aria-hidden="true"><Filter /></el-icon>
        <span>筛选</span>
        <span v-if="activeFilterCount > 0" class="filter-badge">{{ activeFilterCount }}</span>
      </button>
      <div class="sort-group">
        <select v-model="sortBy" class="sort-select" aria-label="旅行排序方式">
          <option value="date">按日期</option>
          <option value="name">按名称</option>
          <option value="location_count">按地点数</option>
        </select>
        <button
          type="button"
          class="icon-btn order-btn"
          :aria-label="order === 'desc' ? '当前为降序，切换为升序' : '当前为升序，切换为降序'"
          :title="order === 'desc' ? '降序（最新在前）' : '升序（最早在前）'"
          @click="order = order === 'desc' ? 'asc' : 'desc'"
        >
          <el-icon aria-hidden="true"><SortDown v-if="order === 'desc'" /><SortUp v-else /></el-icon>
        </button>
      </div>
    </section>

    <transition name="filter-slide">
      <section v-if="showFilters" id="trip-filter-panel" class="filter-panel" aria-label="旅行筛选条件">
        <div class="filter-row">
          <div class="filter-item">
            <label class="filter-label" for="filter-year">年份</label>
            <select id="filter-year" v-model="filterYear" class="filter-select" @change="handleFilterChange">
              <option :value="null">全部</option>
              <option v-for="y in availableYears" :key="y" :value="y">{{ y }}年</option>
            </select>
          </div>
          <div class="filter-item">
            <label class="filter-label" for="filter-month">月份</label>
            <select id="filter-month" v-model="filterMonth" class="filter-select" @change="handleFilterChange">
              <option :value="null">全部</option>
              <option v-for="m in monthOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div class="filter-item">
            <label class="filter-label" for="filter-city">城市</label>
            <select id="filter-city" v-model="filterCity" class="filter-select" @change="handleFilterChange">
              <option value="">全部</option>
              <option v-for="c in availableCities" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>
        <div class="filter-row">
          <div class="filter-item">
            <label class="filter-label" for="filter-date-from">开始日期</label>
            <input id="filter-date-from" v-model="filterDateFrom" type="date" class="filter-input" @change="handleFilterChange" />
          </div>
          <div class="filter-item">
            <label class="filter-label" for="filter-date-to">结束日期</label>
            <input id="filter-date-to" v-model="filterDateTo" type="date" class="filter-input" @change="handleFilterChange" />
          </div>
          <div class="filter-item filter-actions">
            <button type="button" class="clear-btn" :disabled="activeFilterCount === 0" @click="clearFilters">
              清除筛选
            </button>
          </div>
        </div>
      </section>
    </transition>

    <div v-if="activeFilterCount > 0 && !showFilters" class="active-filters" aria-label="已启用的筛选条件">
      <span v-if="filterYear" class="filter-tag">
        {{ filterYear }}年
        <button type="button" :aria-label="`移除${filterYear}年筛选`" @click="filterYear = null; handleFilterChange()"><el-icon><Close /></el-icon></button>
      </span>
      <span v-if="filterMonth" class="filter-tag">
        {{ filterMonth }}月
        <button type="button" :aria-label="`移除${filterMonth}月筛选`" @click="filterMonth = null; handleFilterChange()"><el-icon><Close /></el-icon></button>
      </span>
      <span v-if="filterCity" class="filter-tag">
        {{ filterCity }}
        <button type="button" :aria-label="`移除${filterCity}筛选`" @click="filterCity = ''; handleFilterChange()"><el-icon><Close /></el-icon></button>
      </span>
      <span v-if="filterDateFrom" class="filter-tag">
        从 {{ filterDateFrom }}
        <button type="button" aria-label="移除开始日期筛选" @click="filterDateFrom = ''; handleFilterChange()"><el-icon><Close /></el-icon></button>
      </span>
      <span v-if="filterDateTo" class="filter-tag">
        至 {{ filterDateTo }}
        <button type="button" aria-label="移除结束日期筛选" @click="filterDateTo = ''; handleFilterChange()"><el-icon><Close /></el-icon></button>
      </span>
    </div>

    <p v-if="search && !loading" class="search-result" aria-live="polite">
      找到 <strong>{{ total }}</strong> 条旅行记录
    </p>

    <div class="trips-container">
      <!-- 加载骨架 -->
      <SkeletonList v-if="loading && trips.length === 0" variant="cards" :count="6" />

      <section v-else-if="loadError && !loading" class="state-panel" role="alert">
        <h2 class="state-title">旅行列表加载失败</h2>
        <p class="state-description">请检查网络连接后重新加载</p>
        <button type="button" class="state-action" aria-label="重新加载旅行列表" @click="loadTrips">
          重新加载
        </button>
      </section>
      <EmptyState
        v-else-if="trips.length === 0 && !loading && (activeFilterCount > 0 || search)"
        title="没有匹配的旅行"
        description="尝试调整筛选条件"
        actionText="清除筛选"
        @action="clearFilters"
      />
      <EmptyState
        v-else-if="trips.length === 0 && !loading"
        title="还没有旅行记录"
        description="去创建你的第一次旅行吧"
        actionText="创建旅行"
        @action="goToNew"
      />

      <ul v-else class="trips-grid" aria-label="旅行记录">
        <li
          v-for="trip in trips"
          :key="trip.id"
          class="trip-grid-item stagger-item"
        >
          <article class="trip-card">
            <button
              type="button"
              class="card-hit"
              :aria-label="`查看旅行：${trip.title}`"
              @click="goToDetail(trip.id)"
              @keydown.enter.prevent="goToDetail(trip.id)"
            />
            <div class="card-cover">
              <TripCover
                :src="trip.cover_photo_url"
                :alt="trip.title"
                :fallback-text="coverFallbackText(trip.cities, trip.title)"
              />
              <span class="card-duration">{{ durationLabel(trip.start_date, trip.end_date) }}</span>
            </div>
            <div class="card-body">
              <p class="card-date">{{ formatDateRange(trip.start_date, trip.end_date) }}</p>
              <h2 class="card-title">{{ trip.title }}</h2>
              <p v-if="trip.description" class="card-description">{{ trip.description }}</p>
              <div class="card-meta">
                <span v-if="trip.cities.length" class="city-chips">
                  <span v-for="city in trip.cities.slice(0, 3)" :key="city" class="city-chip">{{ city }}</span>
                  <span v-if="trip.cities.length > 3" class="city-chip city-more">+{{ trip.cities.length - 3 }}</span>
                </span>
                <span class="loc-count">
                  {{ trip.location_count }} 个地点
                  <el-icon aria-hidden="true"><ArrowRight /></el-icon>
                </span>
              </div>
            </div>
          </article>
        </li>
      </ul>

      <nav v-if="total > PAGE_SIZE" class="pagination" aria-label="旅行列表分页">
        <button type="button" class="page-btn" :disabled="page <= 1" @click="page--; loadTrips()">上一页</button>
        <span class="page-info" aria-current="page">{{ page }} / {{ Math.ceil(total / PAGE_SIZE) }}</span>
        <button type="button" class="page-btn" :disabled="page >= Math.ceil(total / PAGE_SIZE)" @click="page++; loadTrips()">下一页</button>
      </nav>
    </div>
  </main>
</template>

<style scoped>
.trips-page {
  max-width: 1240px;
  margin: 0 auto;
  padding: var(--space-2xl) clamp(20px, 4vw, 56px) var(--space-3xl);
}

/* ========== 页头 ========== */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-lg);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-lg);
}

.page-kicker {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.22em;
  color: var(--color-accent);
  margin-bottom: var(--space-sm);
}

.title-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-md);
}

.page-title {
  font-size: var(--text-2xl);
  line-height: var(--lh-2xl);
  font-weight: 700;
}

.trip-count {
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
  letter-spacing: 0.06em;
}

.create-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 22px;
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color var(--dur-base) var(--ease-out),
    transform var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

.create-btn:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-primary);
}

/* ========== 工具条 ========== */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.search-box {
  position: relative;
  width: 360px;
  max-width: 100%;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 15px;
  color: var(--color-ink-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 40px;
  padding: 0 36px 0 36px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  outline: none;
  transition: border-color var(--dur-base) ease, box-shadow var(--dur-base) ease;
}

.search-input::placeholder {
  color: var(--color-ink-muted);
}

.search-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 14%, transparent);
}

.search-box .search-clear {
  position: absolute;
  right: -2px;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  cursor: pointer;
  transition: color var(--dur-fast) ease, background-color var(--dur-fast) ease,
    border-color var(--dur-fast) ease;
}

.icon-btn:hover {
  color: var(--color-ink);
  background: var(--color-surface-muted);
}

.filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 0 18px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: color var(--dur-fast) ease, background-color var(--dur-fast) ease,
    border-color var(--dur-fast) ease;
}

.filter-toggle:hover,
.filter-toggle.active {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: 11px;
  font-weight: 600;
}

.sort-group {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.sort-select {
  height: 40px;
  padding: 0 30px 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a938c' stroke-width='2.4'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  transition: border-color var(--dur-fast) ease;
}

.sort-select:hover {
  border-color: var(--color-border-strong);
}

.order-btn {
  border-color: var(--color-border);
}

/* ========== 筛选面板 ========== */
.filter-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  margin-bottom: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.filter-row {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 150px;
}

.filter-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-ink-muted);
  letter-spacing: 0.08em;
}

.filter-select,
.filter-input {
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-canvas);
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-family: var(--font-sans);
}

.filter-actions {
  justify-content: flex-end;
  min-width: auto;
}

.clear-btn {
  align-self: flex-end;
  height: 38px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease;
}

.clear-btn:hover:not(:disabled) {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.clear-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.filter-slide-enter-active,
.filter-slide-leave-active {
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}

.filter-slide-enter-from,
.filter-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ========== 已启用筛选标签 ========== */
.active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.filter-tag {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 6px 0 12px;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: var(--text-xs);
  font-weight: 500;
}

.filter-tag button {
  position: absolute;
  right: -12px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.filter-tag button:hover {
  background: color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.filter-tag .el-icon {
  font-size: 12px;
}

/* ========== 搜索结果计数 ========== */
.search-result {
  margin-bottom: var(--space-md);
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
}

.search-result strong {
  color: var(--color-primary);
}

/* ========== 封面卡片网格 ========== */
.trips-grid {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-lg);
}

.trip-card {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
  box-shadow: var(--shadow-soft);
  transition: box-shadow var(--dur-slow) var(--ease-out),
    transform var(--dur-slow) var(--ease-out);
}

.trip-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-card);
}

.card-hit {
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.card-hit:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.card-cover {
  position: relative;
}

.card-cover :deep(.trip-cover) {
  border-radius: 0;
}

.trip-card:hover .card-cover :deep(.cover-img) {
  transform: scale(1.045);
}

.card-duration {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(12, 18, 15, 0.55);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.06em;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  padding: var(--space-md) var(--space-lg) var(--space-lg);
}

.card-date {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  letter-spacing: 0.08em;
}

.card-title {
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  font-weight: 700;
}

.card-description {
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--color-ink-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-top: auto;
  padding-top: var(--space-md);
}

.city-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.city-chip {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-ink-secondary);
  font-size: var(--text-xs);
  white-space: nowrap;
}

.loc-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.loc-count .el-icon {
  font-size: 12px;
}

/* ========== 加载失败面板 ========== */
.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-3xl) var(--space-lg);
  text-align: center;
}

.state-title {
  font-size: var(--text-md);
}

.state-description {
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
}

.state-action {
  margin-top: var(--space-sm);
  height: 40px;
  padding: 0 22px;
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--text-sm);
  cursor: pointer;
}

/* ========== 分页 ========== */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  margin-top: var(--space-2xl);
}

.page-btn {
  height: 38px;
  padding: 0 20px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: border-color var(--dur-fast) ease, color var(--dur-fast) ease;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.page-info {
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
  font-variant-numeric: tabular-nums;
}

/* ========== 响应式 ========== */
@media (max-width: 1280px) {
  .trips-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .trips-page {
    padding: var(--space-lg) var(--space-md) var(--space-2xl);
  }

  .trips-grid {
    grid-template-columns: 1fr;
    gap: var(--space-md);
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .create-btn {
    justify-content: center;
  }

  .toolbar {
    flex-wrap: wrap;
  }

  .search-box {
    width: 100%;
  }

  .sort-group {
    margin-left: 0;
  }
}
</style>
