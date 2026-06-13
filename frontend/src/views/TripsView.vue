<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getTrips, getTripCities, getTripYears } from '../api/trips'
import { formatDateRange } from '../utils/format'
import EmptyState from '../components/EmptyState.vue'
import type { Trip } from '../types'

const router = useRouter()
const route = useRoute()
const trips = ref<Trip[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
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

async function loadTrips() {
  loading.value = true
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
      page_size: 20,
    })
    trips.value = data.items
    total.value = data.total
  } catch {
    console.error('加载旅行列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 从 URL query 初始化筛选条件
  if (route.query.city) search.value = route.query.city as string
  if (route.query.year) filterYear.value = Number(route.query.year)

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

function formatDate(start: string, end: string) {
  return formatDateRange(start, end)
}

function getDuration(start: string, end: string) {
  const days = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
  return `${days}天`
}
</script>

<template>
  <div class="trips-page">
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">我的旅行</h2>
        <span v-if="total > 0" class="trip-count">{{ total }} 次旅行</span>
      </div>
      <button class="create-btn" @click="goToNew">
        <span class="btn-icon">+</span>
        <span>新建旅行</span>
      </button>
    </div>

    <!-- Search & Filter Bar -->
    <div class="toolbar">
      <div class="search-box">
        <input
          v-model="search"
          class="search-input"
          placeholder="搜索标题、描述、城市..."
          @keyup.enter="handleSearch"
        />
        <button v-if="search" class="search-clear" @click="search = ''; handleSearch()">×</button>
      </div>
      <button
        :class="['filter-toggle', { active: showFilters || activeFilterCount > 0 }]"
        @click="showFilters = !showFilters"
      >
        筛选
        <span v-if="activeFilterCount > 0" class="filter-badge">{{ activeFilterCount }}</span>
      </button>
      <div class="sort-group">
        <select v-model="sortBy" class="sort-select" @change="handleFilterChange">
          <option value="date">按日期</option>
          <option value="name">按名称</option>
          <option value="location_count">按地点数</option>
        </select>
        <button class="order-btn" @click="order = order === 'desc' ? 'asc' : 'desc'; handleFilterChange()">
          {{ order === 'desc' ? '↓' : '↑' }}
        </button>
      </div>
    </div>

    <!-- Filter Panel -->
    <transition name="filter-slide">
      <div v-if="showFilters" class="filter-panel">
        <div class="filter-row">
          <div class="filter-item">
            <label class="filter-label">年份</label>
            <select v-model="filterYear" class="filter-select" @change="handleFilterChange">
              <option :value="null">全部</option>
              <option v-for="y in availableYears" :key="y" :value="y">{{ y }}年</option>
            </select>
          </div>
          <div class="filter-item">
            <label class="filter-label">月份</label>
            <select v-model="filterMonth" class="filter-select" @change="handleFilterChange">
              <option :value="null">全部</option>
              <option v-for="m in monthOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div class="filter-item">
            <label class="filter-label">城市</label>
            <select v-model="filterCity" class="filter-select" @change="handleFilterChange">
              <option value="">全部</option>
              <option v-for="c in availableCities" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>
        <div class="filter-row">
          <div class="filter-item">
            <label class="filter-label">开始日期</label>
            <input type="date" v-model="filterDateFrom" class="filter-input" @change="handleFilterChange" />
          </div>
          <div class="filter-item">
            <label class="filter-label">结束日期</label>
            <input type="date" v-model="filterDateTo" class="filter-input" @change="handleFilterChange" />
          </div>
          <div class="filter-item filter-actions">
            <button class="clear-btn" @click="clearFilters" :disabled="activeFilterCount === 0">
              清除筛选
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Active Filters -->
    <div v-if="activeFilterCount > 0 && !showFilters" class="active-filters">
      <span v-if="filterYear" class="filter-tag">
        {{ filterYear }}年 <button @click="filterYear = null; handleFilterChange()">×</button>
      </span>
      <span v-if="filterMonth" class="filter-tag">
        {{ filterMonth }}月 <button @click="filterMonth = null; handleFilterChange()">×</button>
      </span>
      <span v-if="filterCity" class="filter-tag">
        {{ filterCity }} <button @click="filterCity = ''; handleFilterChange()">×</button>
      </span>
      <span v-if="filterDateFrom" class="filter-tag">
        从 {{ filterDateFrom }} <button @click="filterDateFrom = ''; handleFilterChange()">×</button>
      </span>
      <span v-if="filterDateTo" class="filter-tag">
        至 {{ filterDateTo }} <button @click="filterDateTo = ''; handleFilterChange()">×</button>
      </span>
    </div>

    <!-- Result -->
    <div v-if="search && !loading" class="search-result">
      找到 <strong>{{ total }}</strong> 条旅行记录
    </div>

    <div v-loading="loading" class="trips-container">
      <!-- Empty State -->
      <EmptyState
        v-if="trips.length === 0 && !loading && (activeFilterCount > 0 || search)"
        icon="🌍"
        title="没有匹配的旅行"
        description="尝试调整筛选条件"
        actionText="清除筛选"
        @action="clearFilters"
      />
      <EmptyState
        v-else-if="trips.length === 0 && !loading"
        icon="🌍"
        title="还没有旅行记录"
        description="去创建你的第一次旅行吧"
        actionText="创建旅行"
        @action="goToNew"
      />

      <!-- Trip Cards -->
      <div v-else class="trips-grid">
        <div
          v-for="(trip, index) in trips"
          :key="trip.id"
          class="trip-card stagger-item"
          :style="{ animationDelay: `${index * 60}ms` }"
          @click="goToDetail(trip.id)"
        >
          <div class="card-header">
            <h3 class="card-title">{{ trip.title }}</h3>
            <span class="card-duration">{{ getDuration(trip.start_date, trip.end_date) }}</span>
          </div>
          <div class="card-date">{{ formatDate(trip.start_date, trip.end_date) }}</div>
          <p v-if="trip.description" class="card-desc">{{ trip.description }}</p>
          <div class="card-footer">
            <div class="card-cities">
              <span v-for="city in trip.cities" :key="city" class="city-tag">{{ city }}</span>
            </div>
            <span class="card-locations">{{ trip.location_count }} 个地点</span>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="total > 20" class="pagination">
        <button class="page-btn" :disabled="page <= 1" @click="page--; loadTrips()">上一页</button>
        <span class="page-info">{{ page }} / {{ Math.ceil(total / 20) }}</span>
        <button class="page-btn" :disabled="page >= Math.ceil(total / 20)" @click="page++; loadTrips()">下一页</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trips-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 28px 24px;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.page-title {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 700;
  color: var(--color-warm-gray-900);
}

.trip-count {
  font-size: 14px;
  color: var(--color-warm-gray-500);
}

.create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-amber);
  color: white;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
}

.create-btn:hover {
  background: var(--color-amber-dark);
  transform: translateY(-1px);
  box-shadow: var(--shadow-warm);
}

.btn-icon {
  font-size: 16px;
  font-weight: 700;
}

/* Toolbar */
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.search-box {
  flex: 1;
  min-width: 200px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  height: 40px;
  background: var(--color-warm-white);
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
}

.search-box:focus-within {
  border-color: var(--color-amber);
  box-shadow: 0 0 0 3px rgba(212, 168, 83, 0.12);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-warm-gray-900);
  outline: none;
}

.search-input::placeholder {
  color: var(--color-warm-gray-300);
}

.search-clear {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: var(--color-warm-gray-100);
  color: var(--color-warm-gray-500);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.filter-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  height: 40px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  background: var(--color-warm-white);
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-warm-gray-700);
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-toggle:hover,
.filter-toggle.active {
  border-color: var(--color-amber);
  color: var(--color-amber-dark);
}

.filter-badge {
  width: 18px;
  height: 18px;
  background: var(--color-amber);
  color: white;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sort-group {
  display: flex;
  gap: 6px;
}

.sort-select {
  padding: 0 12px;
  height: 40px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  background: var(--color-warm-white);
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-warm-gray-700);
  cursor: pointer;
  outline: none;
}

.order-btn {
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  background: var(--color-warm-white);
  font-size: 16px;
  color: var(--color-warm-gray-700);
  cursor: pointer;
}

/* Filter Panel */
.filter-panel {
  background: var(--color-warm-white);
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 16px;
}

.filter-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.filter-row:last-child {
  margin-bottom: 0;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 140px;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-warm-gray-500);
}

.filter-select,
.filter-input {
  padding: 8px 12px;
  height: 36px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-sm);
  background: var(--color-cream);
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-warm-gray-900);
  outline: none;
  transition: border-color 0.2s ease;
}

.filter-select:focus,
.filter-input:focus {
  border-color: var(--color-amber);
}

.filter-actions {
  justify-content: flex-end;
  align-self: flex-end;
}

.clear-btn {
  padding: 8px 16px;
  height: 36px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-sm);
  background: var(--color-warm-white);
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-warm-gray-700);
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover:not(:disabled) {
  border-color: var(--color-terracotta);
  color: var(--color-terracotta);
}

.clear-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Filter transition */
.filter-slide-enter-active {
  transition: all 0.25s ease-out;
}

.filter-slide-leave-active {
  transition: all 0.2s ease-in;
}

.filter-slide-enter-from,
.filter-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
  max-height: 0;
}

/* Active Filters */
.active-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(212, 168, 83, 0.1);
  border: 1px solid var(--color-amber-light);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-amber-dark);
  font-weight: 500;
}

.filter-tag button {
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: var(--color-amber);
  color: white;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-result {
  font-size: 13px;
  color: var(--color-warm-gray-500);
  margin-bottom: 16px;
}

.search-result strong {
  color: var(--color-amber-dark);
}

/* Trip Cards */
.trips-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.trip-card {
  background: var(--color-warm-white);
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-lg);
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.trip-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--color-amber), var(--color-terracotta-light));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.trip-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-card);
  border-color: var(--color-amber-light);
}

.trip-card:hover::before {
  opacity: 1;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}

.card-title {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
  color: var(--color-warm-gray-900);
  line-height: 1.4;
  flex: 1;
  margin-right: 8px;
}

.card-duration {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-amber-dark);
  background: rgba(212, 168, 83, 0.1);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.card-date {
  font-size: 13px;
  color: var(--color-warm-gray-500);
  margin-bottom: 10px;
}

.card-desc {
  font-size: 13px;
  color: var(--color-warm-gray-700);
  line-height: 1.6;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--color-warm-gray-100);
}

.card-cities {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.city-tag {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-cream);
  color: var(--color-warm-gray-700);
  border: 1px solid var(--color-warm-gray-100);
}

.card-locations {
  font-size: 12px;
  color: var(--color-warm-gray-500);
  white-space: nowrap;
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--color-warm-gray-100);
}

.page-btn {
  padding: 8px 16px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  background: var(--color-warm-white);
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-warm-gray-700);
  cursor: pointer;
  transition: all 0.2s ease;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--color-amber);
  color: var(--color-amber-dark);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--color-warm-gray-500);
}

@media (max-width: 768px) {
  .trips-page {
    padding: 20px 16px;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .create-btn {
    width: 100%;
    justify-content: center;
  }

  .toolbar {
    flex-direction: column;
  }

  .filter-row {
    flex-direction: column;
  }

  .filter-item {
    min-width: 100%;
  }

  .trips-grid {
    grid-template-columns: 1fr;
  }
}
</style>
