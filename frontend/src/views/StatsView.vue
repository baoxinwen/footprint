<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getOverview, getYearly, getMonthly, getCityRank } from '../api/stats'
import EmptyState from '../components/EmptyState.vue'
import type { OverviewStats, YearlyStats, MonthlyStats, CityRank } from '../types'

const router = useRouter()
const overview = ref<OverviewStats>({ trip_count: 0, city_count: 0, province_count: 0, total_days: 0 })
const yearly = ref<YearlyStats[]>([])
const monthly = ref<MonthlyStats[]>([])
const cities = ref<CityRank[]>([])
const loading = ref(true)

onMounted(async () => {
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
  } finally {
    loading.value = false
  }
})

const monthLabels = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function maxYearly() {
  return Math.max(...yearly.value.map((y) => y.count), 1)
}

function maxMonthly() {
  return Math.max(...monthly.value.map((m) => m.count), 1)
}

function getMonthlyCount(month: number) {
  const found = monthly.value.find((m) => m.month === month)
  return found ? found.count : 0
}

function getMonthlyPercent(month: number) {
  const count = getMonthlyCount(month)
  return maxMonthly() > 0 ? (count / maxMonthly()) * 100 : 0
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
]
</script>

<template>
  <div class="stats-page" v-loading="loading">
    <div class="page-header">
      <h2 class="page-title">统计分析</h2>
      <p class="page-desc">用数据回顾你的旅行足迹</p>
    </div>

    <!-- Empty State -->
    <EmptyState
      v-if="overview.trip_count === 0 && !loading"
      icon="📊"
      title="暂无统计数据"
      description="记录你的第一次旅行，这里将展示丰富的统计图表"
      actionText="创建旅行"
      @action="router.push('/trips/new')"
    />

    <template v-else>
      <!-- Overview Cards -->
      <div class="overview-grid">
        <div
          v-for="(card, index) in statCards"
          :key="card.key"
          class="stat-card stagger-item"
          :style="{ animationDelay: `${index * 80}ms` }"
          @click="card.action"
        >
          <div class="stat-icon">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="stat-value">{{ overview[card.key as keyof typeof overview] }}</div>
          <div class="stat-label">{{ card.label }}</div>
          <div class="stat-arrow">→</div>
        </div>
      </div>

      <!-- Yearly Chart -->
      <div class="chart-card stagger-item" style="animation-delay: 350ms">
        <div class="chart-header">
          <div>
            <h3 class="chart-title">年度统计</h3>
            <p class="chart-desc">每年的旅行次数，点击柱状图查看详情</p>
          </div>
        </div>
        <div class="bar-chart horizontal">
          <div
            v-for="item in yearly"
            :key="item.year"
            class="bar-row clickable"
            @click="goToYearTrips(item.year)"
          >
            <span class="bar-label">{{ item.year }}</span>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ width: (item.count / maxYearly()) * 100 + '%' }"
              >
                <span class="bar-value">{{ item.count }} 次</span>
              </div>
            </div>
            <span class="bar-action">查看 →</span>
          </div>
        </div>
      </div>

      <!-- Monthly Chart -->
      <div class="chart-card stagger-item" style="animation-delay: 450ms">
        <h3 class="chart-title">月度分布</h3>
        <p class="chart-desc">你常在哪些月份出行</p>
        <div class="bar-chart vertical">
          <div v-for="m in 12" :key="m" class="bar-col">
            <div class="bar-v-value">{{ getMonthlyCount(m) || '' }}</div>
            <div class="bar-v-track">
              <div
                class="bar-v-fill"
                :class="{ highlight: getMonthlyCount(m) === maxMonthly() && maxMonthly() > 0 }"
                :style="{ height: getMonthlyPercent(m) + '%' }"
              ></div>
            </div>
            <div class="bar-v-label">{{ monthLabels[m] }}</div>
          </div>
        </div>
      </div>

      <!-- City Rank -->
      <div class="chart-card stagger-item" style="animation-delay: 550ms">
        <h3 class="chart-title">城市排行榜</h3>
        <p class="chart-desc">到访次数最多的城市，点击可查看该城市的旅行</p>
        <div class="city-rank">
          <div
            v-for="(city, index) in cities"
            :key="city.city"
            :class="['rank-item', { top3: index < 3 }]"
            @click="goToCityTrips(city.city)"
          >
            <div class="rank-num" :class="{ gold: index === 0, silver: index === 1, bronze: index === 2 }">
              {{ index + 1 }}
            </div>
            <div class="rank-body">
              <div class="rank-top">
                <span class="rank-name">{{ city.city }}</span>
                <span class="rank-count">{{ city.count }} 次</span>
              </div>
              <div class="rank-bar">
                <div
                  class="rank-bar-fill"
                  :style="{ width: (city.count / cities[0].count) * 100 + '%' }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stats-page {
  max-width: 800px;
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
  margin-bottom: 6px;
}

.page-desc {
  font-size: 14px;
  color: var(--color-warm-gray-500);
}

/* Overview Cards */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--color-warm-white);
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-lg);
  padding: 20px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.25s ease;
  position: relative;
  overflow: hidden;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-card);
  border-color: var(--color-amber-light);
}

.stat-icon {
  font-size: 24px;
  margin-bottom: 8px;
  color: var(--color-amber);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon .el-icon {
  font-size: 24px;
}

.stat-value {
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-warm-gray-900);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  color: var(--color-warm-gray-500);
}

.stat-arrow {
  position: absolute;
  bottom: 10px;
  right: 14px;
  font-size: 14px;
  color: var(--color-warm-gray-300);
  transition: all 0.2s ease;
}

.stat-card:hover .stat-arrow {
  color: var(--color-amber);
  transform: translateX(3px);
}

/* Chart Cards */
.chart-card {
  background: var(--color-warm-white);
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-bottom: 16px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}

.chart-title {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
  color: var(--color-warm-gray-900);
  margin-bottom: 4px;
}

.chart-desc {
  font-size: 13px;
  color: var(--color-warm-gray-500);
  margin-bottom: 20px;
}

/* Horizontal Bar Chart */
.bar-chart.horizontal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  transition: background 0.2s ease;
}

.bar-row.clickable {
  cursor: pointer;
}

.bar-row.clickable:hover {
  background: var(--color-cream);
}

.bar-label {
  width: 48px;
  text-align: right;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-warm-gray-700);
  flex-shrink: 0;
}

.bar-track {
  flex: 1;
  height: 28px;
  background: var(--color-cream);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-amber), var(--color-amber-light));
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  padding-left: 10px;
  min-width: 36px;
  transition: width 0.6s ease;
}

.bar-value {
  font-size: 12px;
  font-weight: 600;
  color: white;
  white-space: nowrap;
}

.bar-action {
  font-size: 12px;
  color: var(--color-warm-gray-300);
  white-space: nowrap;
  transition: color 0.2s ease;
}

.bar-row.clickable:hover .bar-action {
  color: var(--color-amber-dark);
}

/* Vertical Bar Chart */
.bar-chart.vertical {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  height: 180px;
  padding-top: 20px;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.bar-v-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-warm-gray-700);
  margin-bottom: 4px;
  min-height: 16px;
}

.bar-v-track {
  flex: 1;
  width: 100%;
  background: var(--color-cream);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}

.bar-v-fill {
  width: 100%;
  background: linear-gradient(to top, var(--color-amber), var(--color-amber-light));
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  transition: height 0.6s ease;
  min-height: 2px;
}

.bar-v-fill.highlight {
  background: linear-gradient(to top, var(--color-terracotta), var(--color-terracotta-light));
}

.bar-v-label {
  font-size: 11px;
  color: var(--color-warm-gray-500);
  margin-top: 6px;
}

/* City Rank */
.city-rank {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.rank-item:hover {
  background: var(--color-cream);
  border-color: var(--color-warm-gray-100);
  transform: translateX(2px);
}

.rank-item.top3 {
  background: rgba(212, 168, 83, 0.04);
  border-color: rgba(212, 168, 83, 0.12);
}

.rank-num {
  width: 30px;
  height: 30px;
  background: var(--color-cream-dark);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-warm-gray-500);
  flex-shrink: 0;
}

.rank-num.gold {
  background: var(--color-amber);
  color: white;
}

.rank-num.silver {
  background: var(--color-warm-gray-300);
  color: white;
}

.rank-num.bronze {
  background: var(--color-terracotta-light);
  color: white;
}

.rank-body {
  flex: 1;
  min-width: 0;
}

.rank-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.rank-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--color-warm-gray-900);
}

.rank-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-amber-dark);
  white-space: nowrap;
}

.rank-bar {
  height: 6px;
  background: var(--color-cream-dark);
  border-radius: 3px;
  overflow: hidden;
}

.rank-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-amber), var(--color-amber-light));
  border-radius: 3px;
  transition: width 0.6s ease;
}

@media (max-width: 768px) {
  .stats-page {
    padding: 20px 16px;
  }

  .overview-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat-value {
    font-size: 24px;
  }

  .bar-row.clickable {
    padding: 8px 4px;
  }

  .bar-action {
    display: none;
  }

  .rank-arrow {
    display: none;
  }
}
</style>
