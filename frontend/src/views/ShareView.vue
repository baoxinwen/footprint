<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSharedPhotos, viewShare } from '../api/shares'
import type { ShareViewTrip, Photo } from '../types'
import { renderMarkdown } from '../utils/markdown'
import { formatDateCN } from '../utils/format'
import PhotoViewer from '../components/PhotoViewer.vue'
import TripHero from '../components/TripHero.vue'

const route = useRoute()
const router = useRouter()
const token = route.params.token as string
const trip = ref<ShareViewTrip | null>(null)
const loading = ref(true)
const error = ref('')
const expandedLocations = ref<Set<number>>(new Set())
const locationPhotos = ref<Record<number, Photo[]>>({})
const photoLoading = ref<Record<number, boolean>>({})
const photoErrors = ref<Record<number, string>>({})
const showPhotoViewer = ref(false)
const viewerPhotos = ref<Photo[]>([])
const viewerIndex = ref(0)

onMounted(async () => {
  try {
    const { data } = await viewShare(token)
    trip.value = data
  } catch (err) {
    // 与 TripFormView.handleSave 一致的类型化错误解构，兼容非 AxiosError 形态
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 410) {
      router.replace('/share/expired')
    } else {
      error.value = '分享链接不存在或已失效'
    }
  } finally {
    loading.value = false
  }
})

function toggleLocation(locId: number) {
  if (expandedLocations.value.has(locId)) {
    expandedLocations.value.delete(locId)
  } else {
    expandedLocations.value.add(locId)
    loadPhotos(locId)
  }
}

async function loadPhotos(locationId: number) {
  if (photoLoading.value[locationId]) return

  photoLoading.value[locationId] = true
  photoErrors.value[locationId] = ''
  try {
    const { data } = await getSharedPhotos(token, locationId)
    locationPhotos.value[locationId] = data
  } catch {
    photoErrors.value[locationId] = '照片加载失败，请检查网络连接后重新加载'
  } finally {
    photoLoading.value[locationId] = false
  }
}

function openViewer(photos: Photo[], index: number) {
  viewerPhotos.value = photos
  viewerIndex.value = index
  showPhotoViewer.value = true
}

function renderNote(note: string | null) {
  return note ? renderMarkdown(note) : ''
}

const totalPhotos = computed(() =>
  trip.value?.locations.reduce((sum, loc) => sum + (loc.photo_count || 0), 0) ?? 0,
)

const stopCount = computed(() => trip.value?.locations.length ?? 0)
</script>

<template>
  <div class="share-page">
    <!-- 品牌头 -->
    <header class="share-brand">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 21s-7-5.1-7-11a7 7 0 1 1 14 0c0 5.9-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.6" />
        </svg>
      </span>
      <span class="brand-name">旅行足迹</span>
    </header>

    <div v-if="loading" class="share-loading" role="status"><span class="visually-hidden">加载中</span></div>

    <div v-else-if="error" class="error-state" role="alert">
      <p>{{ error }}</p>
      <p class="error-hint">请向分享者确认链接是否完整、是否已过期，或获取新的分享链接。</p>
      <button type="button" class="error-action" @click="router.push('/')">返回首页</button>
    </div>

    <div v-else-if="trip" class="share-content">
      <!-- Hero（TripHero 共享组件，紧凑公开页档） -->
      <TripHero
        kicker="旅行分享"
        :title="trip.title"
        :start-date="trip.start_date"
        :end-date="trip.end_date"
        :cover-url="trip.cover_photo_url ?? undefined"
        :description="trip.description ?? undefined"
        :expiry-note="trip.expires_at ? `链接有效期至 ${formatDateCN(trip.expires_at)}` : undefined"
        compact
      />

      <!-- 概览 -->
      <div class="share-meta">
        <span>{{ stopCount }} 个地点</span>
        <span class="meta-dot" aria-hidden="true">·</span>
        <span>{{ totalPhotos }} 张照片</span>
      </div>

      <div class="locations-list">
        <div v-for="(loc, index) in trip.locations" :key="loc.id" class="location-card">
          <button
            type="button"
            class="location-header"
            :aria-expanded="expandedLocations.has(loc.id)"
            @click="toggleLocation(loc.id)"
          >
            <div class="location-info">
              <span class="location-index">{{ index + 1 }}</span>
              <span class="location-text">
                <span class="location-name">{{ loc.name }}</span>
                <span class="location-city">{{ loc.city }} · {{ loc.province }}</span>
              </span>
            </div>
            <span class="location-summary">{{ loc.photo_count || 0 }} 张照片</span>
            <el-icon class="expand-icon" :class="{ expanded: expandedLocations.has(loc.id) }">
              <ArrowDown />
            </el-icon>
          </button>

          <div v-if="expandedLocations.has(loc.id)" class="location-body">
            <div v-if="photoLoading[loc.id]" class="photo-status">照片加载中...</div>
            <div v-else-if="photoErrors[loc.id]" class="photo-status photo-status-error">
              <span>{{ photoErrors[loc.id] }}</span>
              <button
                type="button"
                class="retry-button"
                :data-testid="`retry-photos-${loc.id}`"
                @click="loadPhotos(loc.id)"
              >
                重新加载
              </button>
            </div>
            <div v-if="locationPhotos[loc.id]?.length" class="photos-grid">
              <button
                v-for="(photo, pIndex) in locationPhotos[loc.id]"
                :key="photo.id"
                type="button"
                class="photo-item"
                :aria-label="`查看照片：${photo.file_name}`"
                @click="openViewer(locationPhotos[loc.id], pIndex)"
              >
                <img :src="photo.thumbnail_url" :alt="photo.file_name" loading="lazy" />
              </button>
            </div>

            <div
              v-else-if="locationPhotos[loc.id] && !photoLoading[loc.id] && !photoErrors[loc.id]"
              class="photo-status"
            >
              这个地点暂未分享照片
            </div>

            <div v-if="loc.note" class="note-section markdown-body" v-html="renderNote(loc.note)"></div>
          </div>
        </div>
      </div>

      <!-- 页脚 -->
      <footer class="share-footer">
        <span>由 <strong>旅行足迹</strong> 记录生成</span>
      </footer>
    </div>

    <!-- Photo viewer -->
    <PhotoViewer
      :photos="viewerPhotos"
      :index="viewerIndex"
      :visible="showPhotoViewer"
      @close="showPhotoViewer = false"
      @update:index="viewerIndex = $event"
    />
  </div>
</template>

<style scoped>
.share-page {
  max-width: 880px;
  margin: 0 auto;
  padding: var(--space-lg) clamp(16px, 3vw, 40px) var(--space-2xl);
  min-height: 100dvh;
}

/* ========== 品牌头 ========== */
.share-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: var(--space-md);
  margin-bottom: var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.brand-mark {
  display: inline-flex;
  color: var(--color-primary);
}

.brand-name {
  font-family: var(--font-serif);
  font-size: var(--text-md);
  font-weight: var(--fw-bold);
  letter-spacing: 0.08em;
  color: var(--color-ink);
}

/* ========== 加载 ========== */
.share-loading {
  width: 32px;
  height: 32px;
  margin: var(--space-3xl) auto;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 999px;
  animation: spin var(--dur-spin) linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state {
  text-align: center;
  padding: var(--space-3xl) 20px;
  color: var(--color-ink-secondary);
}

.error-hint {
  margin-top: var(--space-sm);
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}

.error-action {
  margin-top: var(--space-lg);
  min-height: 40px;
  padding: 0 var(--space-lg);
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background-color var(--dur-base) var(--ease-out);
}

.error-action:hover {
  background: var(--color-primary-hover);
}

/* ========== 概览 ========== */
.share-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin: var(--space-lg) 0 var(--space-md);
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
  letter-spacing: 0.06em;
}

.meta-dot {
  color: var(--color-ink-muted);
}

/* ========== 地点卡片 ========== */
.locations-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.location-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}

.location-header {
  width: 100%;
  min-height: 64px;
  border: 0;
  padding: var(--space-md) var(--space-lg);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  transition: background-color var(--dur-fast) var(--ease-out);
}

.location-header:hover {
  background: color-mix(in srgb, var(--color-primary-soft) 45%, transparent);
}

.location-header:focus-visible,
.retry-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.location-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  min-width: 0;
}

.location-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1.5px solid var(--color-primary);
  color: var(--color-primary);
  background: var(--color-surface);
  font-family: var(--font-serif);
  font-size: var(--text-sm);
  font-weight: var(--fw-bold);
  flex-shrink: 0;
}

.location-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.location-name {
  font-family: var(--font-serif);
  font-size: var(--text-md);
  font-weight: var(--fw-semibold);
  color: var(--color-ink);
}

.location-city {
  color: var(--color-ink-muted);
  font-size: var(--text-xs);
  letter-spacing: 0.05em;
}

.location-summary {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.expand-icon {
  color: var(--color-ink-muted);
  transition: transform var(--dur-base) var(--ease-out);
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.location-body {
  border-top: 1px solid var(--color-border);
  padding: var(--space-lg);
}

.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.photo-item {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 4 / 3;
  background: var(--color-surface-muted);
}

.photo-item img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--dur-expand) var(--ease-out);
}

.photo-item:hover img {
  transform: scale(1.04);
}

.note-section {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-md);
  color: var(--color-ink-secondary);
}

.photo-status {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: var(--space-md);
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
}

.photo-status-error {
  color: var(--color-danger);
}

.retry-button {
  min-width: 64px;
  min-height: 44px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

/* ========== 页脚 ========== */
.share-footer {
  margin-top: var(--space-2xl);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border);
  text-align: center;
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}

.share-footer strong {
  font-family: var(--font-serif);
  color: var(--color-primary);
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .share-page {
    padding: var(--space-md) var(--space-md) var(--space-xl);
  }

  .location-summary {
    display: none;
  }
}
</style>
