<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getTimeline } from '../api/timeline'
import { formatDateRange } from '../utils/format'
import EmptyState from '../components/EmptyState.vue'
import type { TimelineGroup } from '../types'

const router = useRouter()
const timeline = ref<TimelineGroup[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const { data } = await getTimeline()
    timeline.value = data
  } catch {
    console.error('加载时间线失败')
  } finally {
    loading.value = false
  }
})

function goToDetail(id: number) {
  router.push(`/trips/${id}`)
}

function formatDate(start: string, end: string) {
  return formatDateRange(start, end)
}
</script>

<template>
  <div class="timeline-page" v-loading="loading">
    <div class="page-header">
      <h2 class="page-title">时间线</h2>
      <p class="page-desc">按时间回顾你的旅行足迹</p>
    </div>

    <!-- Empty State -->
    <EmptyState
      v-if="timeline.length === 0 && !loading"
      icon="📅"
      title="还没有旅行记录"
      description="去创建第一次旅行吧，这里将展示你的时间线"
      actionText="创建旅行"
      @action="router.push('/trips/new')"
    />

    <!-- Timeline -->
    <div v-else class="timeline">
      <div
        v-for="(group, gIndex) in timeline"
        :key="`${group.year}-${group.month}`"
        class="timeline-group stagger-item"
        :style="{ animationDelay: `${gIndex * 80}ms` }"
      >
        <div class="group-marker">
          <div class="marker-dot"></div>
          <div class="marker-line"></div>
        </div>

        <div class="group-content">
          <div class="group-header">
            <h3 class="group-label">{{ group.label }}</h3>
            <span class="group-count">{{ group.count }} 次旅行</span>
          </div>

          <div class="group-trips">
            <div
              v-for="trip in group.trips"
              :key="trip.id"
              class="trip-item"
              @click="goToDetail(trip.id)"
            >
              <div class="trip-info">
                <h4 class="trip-title">{{ trip.title }}</h4>
                <span class="trip-date">{{ formatDate(trip.start_date, trip.end_date) }}</span>
              </div>
              <p v-if="trip.description" class="trip-desc">{{ trip.description }}</p>
              <span class="trip-arrow">→</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-page {
  max-width: 700px;
  margin: 0 auto;
  padding: 28px 24px;
}

.page-header {
  margin-bottom: 36px;
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

/* Timeline */
.timeline {
  position: relative;
  padding-left: 32px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 12px;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, var(--color-amber-light), var(--color-warm-gray-100));
  border-radius: 1px;
}

.timeline-group {
  position: relative;
  margin-bottom: 32px;
}

.timeline-group:last-child {
  margin-bottom: 0;
}

.group-marker {
  position: absolute;
  left: -32px;
  top: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.marker-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-amber);
  border: 3px solid var(--color-cream);
  box-shadow: 0 0 0 2px var(--color-amber-light);
  z-index: 1;
}

.group-content {
  padding-left: 8px;
}

.group-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 14px;
}

.group-label {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-warm-gray-900);
}

.group-count {
  font-size: 13px;
  color: var(--color-warm-gray-500);
  background: var(--color-cream-dark);
  padding: 2px 10px;
  border-radius: var(--radius-sm);
}

.group-trips {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trip-item {
  background: var(--color-warm-white);
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.25s ease;
  position: relative;
}

.trip-item:hover {
  transform: translateX(4px);
  box-shadow: var(--shadow-soft);
  border-color: var(--color-amber-light);
}

.trip-info {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.trip-title {
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-warm-gray-900);
}

.trip-date {
  font-size: 12px;
  color: var(--color-warm-gray-500);
  white-space: nowrap;
}

.trip-desc {
  font-size: 13px;
  color: var(--color-warm-gray-700);
  margin-top: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.trip-arrow {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-warm-gray-300);
  font-size: 14px;
  transition: all 0.2s ease;
}

.trip-item:hover .trip-arrow {
  color: var(--color-amber);
  transform: translateY(-50%) translateX(3px);
}

@media (max-width: 768px) {
  .timeline-page {
    padding: 20px 16px;
  }

  .trip-info {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
