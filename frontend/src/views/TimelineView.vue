<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getTimeline } from '../api/timeline'
import { coverFallbackText, formatDateRange } from '../utils/format'
import EmptyState from '../components/EmptyState.vue'
import SkeletonList from '../components/SkeletonList.vue'
import TripCover from '../components/TripCover.vue'
import type { TimelineGroup } from '../types'
import { ArrowRight } from '@element-plus/icons-vue'

const router = useRouter()
const timeline = ref<TimelineGroup[]>([])
const loading = ref(true)
const loadError = ref(false)

const yearSections = computed(() => {
  const sections: { year: number; groups: TimelineGroup[] }[] = []
  for (const group of timeline.value) {
    const last = sections[sections.length - 1]
    if (last && last.year === group.year) {
      last.groups.push(group)
    } else {
      sections.push({ year: group.year, groups: [group] })
    }
  }
  return sections
})

async function loadTimeline() {
  loading.value = true
  loadError.value = false
  try {
    const { data } = await getTimeline()
    timeline.value = data
  } catch {
    console.error('加载时间线失败')
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadTimeline)

function goToDetail(id: number) {
  router.push(`/trips/${id}`)
}


</script>

<template>
  <div class="timeline-page">
    <header class="page-header">
      <p class="page-kicker">编年史</p>
      <h1 class="page-title">时间线</h1>
      <p class="page-desc">按时间回顾你的旅行足迹</p>
    </header>

    <SkeletonList v-if="loading" variant="rows" :count="5" />

    <!-- 加载失败 -->
    <section v-else-if="loadError" class="error-panel" role="alert">
      <h3 class="error-title">时间线加载失败</h3>
      <p class="error-desc">请检查网络连接后重新加载</p>
      <button type="button" class="error-retry" aria-label="重新加载时间线" @click="loadTimeline">重新加载</button>
    </section>

    <!-- Empty State -->
    <EmptyState
      v-else-if="timeline.length === 0"
      icon="calendar"
      title="还没有旅行记录"
      description="去创建第一次旅行吧，这里将展示你的时间线"
      actionText="创建旅行"
      @action="router.push('/trips/new')"
    />

    <!-- Timeline -->
    <div v-else class="timeline">
      <section
        v-for="(section, sIndex) in yearSections"
        :key="section.year"
        class="year-section"
      >
        <h2 class="year-heading" :style="{ animationDelay: `${sIndex * 60}ms` }">
          <span class="year-number">{{ section.year }}</span>
          <span class="year-count">{{ section.groups.reduce((n, g) => n + g.count, 0) }} 次旅行</span>
        </h2>

        <div
          v-for="group in section.groups"
          :key="`${group.year}-${group.month}`"
          class="timeline-group"
        >
          <div class="group-marker" aria-hidden="true">
            <div class="marker-dot"></div>
          </div>

          <div class="group-content">
            <div class="group-header">
              <h3 class="group-label">{{ group.label }}</h3>
              <span class="group-count">{{ group.count }} 次</span>
            </div>

            <div class="group-trips">
              <button
                v-for="trip in group.trips"
                :key="trip.id"
                type="button"
                class="trip-item"
                :aria-label="`${trip.title}，${formatDateRange(trip.start_date, trip.end_date)}，查看旅行`"
                @click="goToDetail(trip.id)"
              >
                <span class="trip-cover-mini">
                  <TripCover
                    :src="trip.cover_photo_url"
                    :alt="trip.title"
                    :fallback-text="coverFallbackText(trip.cities, trip.title)"
                    ratio="4 / 3"
                  />
                </span>
                <span class="trip-info">
                  <span class="trip-title-row">
                    <h4 class="trip-title">{{ trip.title }}</h4>
                    <span class="trip-date">{{ formatDateRange(trip.start_date, trip.end_date) }}</span>
                  </span>
                  <span v-if="trip.description" class="trip-desc">{{ trip.description }}</span>
                  <span v-if="trip.cities?.length" class="trip-cities">
                    <span v-for="city in trip.cities.slice(0, 3)" :key="city" class="city-chip">{{ city }}</span>
                  </span>
                </span>
                <el-icon class="trip-arrow" aria-hidden="true"><ArrowRight /></el-icon>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.timeline-page {
  max-width: 860px;
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

/* ========== 年度分隔 ========== */
.year-section {
  margin-bottom: var(--space-2xl);
}

.year-heading {
  position: sticky;
  top: 64px;
  z-index: 5;
  display: flex;
  align-items: baseline;
  gap: var(--space-md);
  padding: var(--space-md) 0;
  margin-bottom: var(--space-md);
  background: linear-gradient(
    to bottom,
    var(--color-canvas) 0%,
    var(--color-canvas) 82%,
    transparent 100%
  );
  animation: riseIn var(--dur-slow) var(--ease-out) both;
}

.year-number {
  font-family: var(--font-serif);
  font-size: var(--text-2xl);
  line-height: var(--lh-2xl);
  font-weight: 700;
  color: var(--color-ink);
}

.year-count {
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
  letter-spacing: 0.06em;
}

/* ========== 月份分组 ========== */
.timeline {
  position: relative;
}

.timeline-group {
  position: relative;
  padding-left: 28px;
  padding-bottom: var(--space-xl);
}

.timeline-group::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 22px;
  bottom: -6px;
  width: 1px;
  background: var(--color-border);
}

.timeline-group:last-child {
  padding-bottom: 0;
}

.timeline-group:last-child::before {
  display: none;
}

.group-marker {
  position: absolute;
  left: 0;
  top: 5px;
}

.marker-dot {
  width: 11px;
  height: 11px;
  border-radius: 999px;
  background: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-canvas), 0 0 0 4px var(--color-accent-soft);
}

.group-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.group-label {
  font-size: var(--text-md);
  font-weight: 600;
}

.group-count {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  letter-spacing: 0.08em;
}

/* ========== 旅行卡片 ========== */
.group-trips {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.trip-item {
  display: flex;
  align-items: stretch;
  gap: var(--space-md);
  width: 100%;
  padding: 10px;
  appearance: none;
  text-align: left;
  font-family: var(--font-sans);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

.trip-item:hover {
  transform: translateX(4px);
  border-color: var(--color-primary);
  box-shadow: var(--shadow-soft);
}

.trip-cover-mini {
  display: block;
  width: 104px;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--color-surface-muted);
}

.trip-cover-mini :deep(.trip-cover) {
  border-radius: 0;
}

.trip-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.trip-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
}

.trip-title {
  font-family: var(--font-serif);
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--color-ink);
}

.trip-date {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.trip-desc {
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.trip-cities {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.city-chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-ink-secondary);
  font-size: var(--text-xs);
}

.trip-arrow {
  align-self: center;
  color: var(--color-ink-muted);
  font-size: 15px;
  flex-shrink: 0;
  transition: color var(--dur-base) ease, transform var(--dur-base) var(--ease-out);
  margin-right: 6px;
}

.trip-item:hover .trip-arrow {
  color: var(--color-primary);
  transform: translateX(3px);
}

@media (max-width: 768px) {
  .timeline-page {
    padding: var(--space-lg) var(--space-md) var(--space-2xl);
  }

  .year-heading {
    top: 60px;
  }

  .trip-item {
    flex-direction: row;
  }

  .trip-cover-mini {
    width: 84px;
  }

  .trip-title-row {
    flex-direction: column;
    gap: 2px;
  }
}
</style>
