<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getOverview, getYearly, getMonthly, getCityRank } from '../api/stats'
import EmptyState from '../components/EmptyState.vue'
import StatCard from '../components/StatCard.vue'
import MonthBars from '../components/MonthBars.vue'
import RankBars from '../components/RankBars.vue'
import type { OverviewStats, YearlyStats, MonthlyStats, CityRank } from '../types'

const router = useRouter()
const overview = ref<OverviewStats>({ trip_count: 0, city_count: 0, province_count: 0, total_days: 0 })
const yearly = ref<YearlyStats[]>([])
const monthly = ref<MonthlyStats[]>([])
const cities = ref<CityRank[]>([])
const loading = ref(true)
const loadError = ref(false)

async function loadStats() {
  loading.value = true
  loadError.value = false
  try {
    const [o, y, m, c] = await Promise.all([
      getOverview(),
      getYearly(),
      getMonthly(),
      getCityRank(),
    ])
    overview.value = o.data
    yearly.value = y.data
    monthly.value = m.data
    cities.value = c.data
  } catch {
    console.error('加载统计数据失败')
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadStats)

function maxYearly() {
  return Math.max(...yearly.value.map((y) => y.count), 1)
}

// Navigation
function goToTrips() {
  router.push('/trips')
}

function goToCityTrips(city: string) {
  router.push({ path: '/trips', query: { city } })
}

function goToYearTrips(year: number) {
  router.push({ path: '/trips', query: { year: String(year) } })
}

function goToTimeline() {
  router.push('/timeline')
}

const statCards = [
  { key: 'trip_count', label: '旅行次数', icon: 'Suitcase', action: goToTrips },
  { key: 'city_count', label: '到访城市', icon: 'Location', action: goToTrips },
  { key: 'province_count', label: '到访省份', icon: 'MapLocation', action: goToTrips },
  { key: 'total_days', label: '累计天数', icon: 'Calendar', action: goToTimeline },
] as const
</script>

<template>
  <div class="stats-page">
    <header class="page-header">
      <div>
        <p class="page-kicker">数据志</p>
        <h2 class="page-title">统计分析</h2>
        <p class="page-desc">用数据回顾你的旅行足迹</p>
      </div>
    </header>

    <div v-if="loading" class="loading-spin" aria-label="加载中"></div>

    <!-- 加载失败 -->
    <section v-else-if="loadError" class="error-panel" role="alert">
      <h3 class="error-title">统计数据加载失败</h3>
      <p class="error-desc">请检查网络连接后重新加载</p>
      <button type="button" class="error-retry" aria-label="重新加载统计数据" @click="loadStats">重新加载</button>
    </section>

    <!-- Empty State -->
    <EmptyState
      v-else-if="overview.trip_count === 0"
      icon="stats"
      title="暂无统计数据"
      description="记录你的第一次旅行，这里将展示丰富的统计图表"
      actionText="创建旅行"
      @action="router.push('/trips/new')"
    />

    <template v-else>
      <!-- 概览卡片 -->
      <div class="overview-grid">
        <button
          v-for="(card, index) in statCards"
          :key="card.key"
          type="button"
          class="stat-card-link stagger-item"
          :style="{ animationDelay: `${index * 60}ms` }"
          :aria-label="`${card.label}${overview[card.key as keyof typeof overview]}，查看旅行`"
          @click="card.action"
        >
          <StatCard
            :label="card.label"
            :value="overview[card.key as keyof typeof overview]"
            :icon="card.icon"
          />
        </button>
      </div>

      <!-- 年度统计 -->
      <section class="chart-section stagger-item" style="animation-delay: 260ms">
        <div class="section-head">
          <h3 class="section-title">年度统计</h3>
          <p class="section-desc">每年的旅行次数，点击查看该年旅行</p>
        </div>
        <div class="chart-card">
          <div class="bar-chart">
            <button
              v-for="item in yearly"
              :key="item.year"
              type="button"
              class="bar-row"
              :aria-label="`${item.year}年旅行${item.count}次，查看旅行`"
              @click="goToYearTrips(item.year)"
            >
              <span class="bar-label">{{ item.year }}</span>
              <span class="bar-track">
                <span
                  class="bar-fill"
                  :style="{ width: (item.count / maxYearly()) * 100 + '%' }"
                ></span>
              </span>
              <span class="bar-value">{{ item.count }} 次</span>
              <span class="bar-action">查看 {{ item.year }} →</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 月度分布 -->
      <section class="chart-section stagger-item" style="animation-delay: 340ms">
        <div class="section-head">
          <h3 class="section-title">月度分布</h3>
          <p class="section-desc">你常在哪些月份出行，高峰月份以金色标出</p>
        </div>
        <div class="chart-card">
          <MonthBars :items="monthly" />
        </div>
      </section>

      <!-- 城市排行榜 -->
      <section class="chart-section stagger-item" style="animation-delay: 420ms">
        <div class="section-head">
          <h3 class="section-title">城市排行榜</h3>
          <p class="section-desc">到访次数最多的城市，点击可查看该城市的旅行</p>
        </div>
        <div class="chart-card">
          <RankBars :items="cities" @select="goToCityTrips" />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.stats-page {
  max-width: 980px;
  margin: 0 auto;
  padding: var(--space-2xl) var(--space-lg) var(--space-3xl);
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
  font-size: var(--text-2xl);
  line-height: var(--lh-2xl);
  font-weight: 700;
}

.page-desc {
  margin-top: var(--space-sm);
  font-size: var(--text-base);
  color: var(--color-ink-secondary);
}

/* ========== 加载失败 ========== */
.error-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-3xl) var(--space-lg);
  text-align: center;
}

.error-title {
  font-size: var(--text-md);
}

.error-desc {
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
}

.error-retry {
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

/* ========== 加载 ========== */
.loading-spin {
  width: 32px;
  height: 32px;
  margin: var(--space-3xl) auto;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== 概览卡片 ========== */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-2xl);
}

.stat-card-link {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: center;
}

.stat-card-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
  border-radius: var(--radius-md);
}

/* ========== 图表区块 ========== */
.chart-section {
  margin-bottom: var(--space-2xl);
}

.section-head {
  margin-bottom: var(--space-md);
}

.section-title {
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  font-weight: 700;
}

.section-desc {
  margin-top: 4px;
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}

.chart-card {
  padding: var(--space-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

/* 年度横条 */
.bar-chart {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.bar-row {
  display: grid;
  grid-template-columns: 56px 1fr auto auto;
  align-items: center;
  gap: var(--space-md);
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dur-fast) ease;
}

.bar-row:hover {
  background: var(--color-surface-muted);
}

.bar-label {
  font-family: var(--font-serif);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
}

.bar-track {
  display: block;
  height: 22px;
  border-radius: 6px;
  background: var(--color-surface-muted);
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, var(--color-accent)));
  transition: width 600ms var(--ease-out);
}

.bar-value {
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
}

.bar-action {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  white-space: nowrap;
  transition: color var(--dur-fast) ease;
}

.bar-row:hover .bar-action {
  color: var(--color-primary);
}

/* ========== 响应式 ========== */
@media (max-width: 900px) {
  .overview-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .stats-page {
    padding: var(--space-lg) var(--space-md) var(--space-2xl);
  }

  .bar-row {
    grid-template-columns: 44px 1fr auto;
  }

  .bar-action {
    display: none;
  }

  .chart-card {
    padding: var(--space-md);
  }
}
</style>
