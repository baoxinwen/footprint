<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTrip, deleteTrip, updateSortOrder } from '../api/trips'
import { uploadPhoto, getPhotos, deletePhoto } from '../api/photos'
import { createShare } from '../api/shares'
import type { TripDetail, Location, Photo } from '../types'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowDown,
  ArrowLeft,
  Delete,
  Document,
  Download,
  Edit,
  FolderOpened,
  Plus,
  Rank,
  Share,
} from '@element-plus/icons-vue'
import { renderMarkdown } from '../utils/markdown'
import { absoluteUrl, downloadBlob } from '../utils/dom'
import { durationDays as durationDaysBetween } from '../utils/format'
import request from '../api/request'
import PhotoViewer from '../components/PhotoViewer.vue'
import AuthenticatedImage from '../components/AuthenticatedImage.vue'
import SkeletonList from '../components/SkeletonList.vue'

const route = useRoute()
const router = useRouter()
const tripId = computed(() => Number(route.params.id))
const trip = ref<TripDetail | null>(null)
const loading = ref(true)
const loadError = ref(false)
const expandedLocations = ref<Set<number>>(new Set())
const locationPhotos = ref<Record<number, Photo[]>>({})
const showPhotoViewer = ref(false)
const viewerPhotos = ref<Photo[]>([])
const viewerIndex = ref(0)
const showExportDialog = ref(false)
let tripLoadGeneration = 0
let photoLoadGeneration = 0
const latestPhotoLoads = new Map<number, number>()

const tripCities = computed(() => {
  if (!trip.value) return []
  return Array.from(new Set(trip.value.locations.map((location) => location.city).filter(Boolean)))
})

const durationDays = computed(() => {
  if (!trip.value) return null
  return durationDaysBetween(trip.value.start_date, trip.value.end_date)
})

// 全旅行照片聚合（照片条）：进入详情后按地点并行拉取
const allPhotosLoaded = ref(false)

const allPhotos = computed<{ photo: Photo; locationName: string }[]>(() => {
  if (!trip.value) return []
  const flat: { photo: Photo; locationName: string }[] = []
  for (const loc of trip.value.locations) {
    for (const photo of locationPhotos.value[loc.id] || []) {
      flat.push({ photo, locationName: loc.name })
    }
  }
  return flat
})

async function preloadAllPhotos() {
  if (!trip.value) return
  const targets = trip.value.locations.filter((loc) => loc.photo_count > 0)
  await Promise.all(targets.map((loc) => loadPhotos(loc.id)))
  allPhotosLoaded.value = true
}

async function loadTrip() {
  const generation = ++tripLoadGeneration
  const requestedTripId = tripId.value
  loading.value = true
  loadError.value = false
  allPhotosLoaded.value = false
  try {
    const { data } = await getTrip(requestedTripId)
    if (generation !== tripLoadGeneration) return
    trip.value = data
    void preloadAllPhotos()
  } catch {
    if (generation !== tripLoadGeneration) return
    trip.value = null
    loadError.value = true
    ElMessage.error('加载失败')
  } finally {
    if (generation === tripLoadGeneration) loading.value = false
  }
}

function resetTripState() {
  trip.value = null
  expandedLocations.value = new Set()
  locationPhotos.value = {}
  showPhotoViewer.value = false
  viewerPhotos.value = []
  viewerIndex.value = 0
  showExportDialog.value = false
  latestPhotoLoads.clear()
  allPhotosLoaded.value = false
}

watch(tripId, () => {
  // 导航离开本视图时 params.id 变 undefined → tripId=NaN（组件卸载前仍存活），
  // 此时不得再发起请求；同时挡住其他非数字路由参数
  if (!Number.isFinite(tripId.value)) return
  resetTripState()
  void loadTrip()
}, { immediate: true, flush: 'sync' })

function toggleLocation(loc: Location) {
  if (expandedLocations.value.has(loc.id)) {
    expandedLocations.value.delete(loc.id)
  } else {
    expandedLocations.value.add(loc.id)
    // 预加载已发起过请求的地点不重复拉取
    if (!latestPhotoLoads.has(loc.id)) loadPhotos(loc.id)
  }
}

async function loadPhotos(locationId: number) {
  const generation = ++photoLoadGeneration
  latestPhotoLoads.set(locationId, generation)
  try {
    const { data } = await getPhotos(locationId)
    if (latestPhotoLoads.get(locationId) !== generation) return
    locationPhotos.value[locationId] = data
  } catch {
    if (latestPhotoLoads.get(locationId) !== generation) return
    ElMessage.error('加载照片失败')
  }
}

const uploadingLocations = ref<Set<number>>(new Set())

async function handleUpload(locationId: number, file: File) {
  if (uploadingLocations.value.has(locationId)) {
    ElMessage.warning('当前地点正在上传中，请稍候')
    return
  }
  uploadingLocations.value.add(locationId)
  try {
    await uploadPhoto(locationId, file)
    ElMessage.success('上传成功')
    loadPhotos(locationId)
  } catch {
    ElMessage.error('上传失败')
  } finally {
    const next = new Set(uploadingLocations.value)
    next.delete(locationId)
    uploadingLocations.value = next
  }
}

function beforeUpload(locationId: number) {
  return (file: File) => {
    handleUpload(locationId, file)
    return false
  }
}

async function handleDeletePhoto(photoId: number, locationId: number) {
  try {
    await ElMessageBox.confirm('确定删除这张照片？', '删除照片', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deletePhoto(photoId)
    ElMessage.success('删除成功')
    loadPhotos(locationId)
  } catch {
    ElMessage.error('删除失败')
  }
}

function openViewer(photos: Photo[], index: number) {
  viewerPhotos.value = photos
  viewerIndex.value = index
  showPhotoViewer.value = true
}

function openStripViewer(index: number) {
  viewerPhotos.value = allPhotos.value.map((item) => item.photo)
  viewerIndex.value = index
  showPhotoViewer.value = true
}

function renderNote(note: string | null) {
  return note ? renderMarkdown(note) : ''
}

function goToEdit() {
  router.push(`/trips/${tripId.value}/edit`)
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm(
      '删除后将同时清除该旅行下的所有地点和照片，且不可恢复',
      '删除旅行',
      { type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await deleteTrip(tripId.value)
    ElMessage.success('删除成功')
    router.push('/trips')
  } catch {
    ElMessage.error('删除失败')
  }
}

async function handleShare() {
  let url: string
  try {
    const { data } = await createShare(tripId.value)
    url = absoluteUrl(`/share/${data.token}`)
  } catch {
    ElMessage.error('分享失败')
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('分享链接已复制到剪贴板')
  } catch {
    // 剪贴板权限失败时分享已创建，展示链接供手动复制
    ElMessageBox.alert(url, '分享链接创建成功，请手动复制', { confirmButtonText: '知道了' })
  }
}

async function handleExport(format: 'json' | 'markdown') {
  try {
    const resp = await request.get(`/trips/${tripId.value}/export/${format}`, { responseType: 'blob' })
    downloadBlob(resp.data, format === 'json' ? 'trip.json' : 'trip.zip')
  } catch {
    ElMessage.error('导出失败')
  }
  showExportDialog.value = false
}

/* ---------- 拖拽排序（PRD 5.6，桌面端） ---------- */
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)
const sortSaving = ref(false)

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  event.dataTransfer?.setData('text/plain', String(index))
  event.dataTransfer!.effectAllowed = 'move'
}

function onDragEnter(index: number) {
  if (dragIndex.value !== null) overIndex.value = index
}

function onDragEnd() {
  dragIndex.value = null
  overIndex.value = null
}

async function onDrop() {
  const from = dragIndex.value
  const to = overIndex.value
  dragIndex.value = null
  overIndex.value = null
  if (from === null || to === null || from === to || !trip.value) return

  const locs = [...trip.value.locations]
  const [moved] = locs.splice(from, 1)
  locs.splice(to, 0, moved)
  trip.value.locations = locs

  sortSaving.value = true
  try {
    await updateSortOrder(
      tripId.value,
      locs.map((loc, i) => ({ location_id: loc.id, sort_order: i })),
    )
    ElMessage.success('顺序已保存')
  } catch {
    ElMessage.error('顺序保存失败')
    loadTrip()
  } finally {
    sortSaving.value = false
  }
}

defineExpose({ refreshPhotos: loadPhotos })
</script>

<template>
  <main class="detail-page">
    <SkeletonList v-if="loading" variant="rows" :count="4" class="detail-skeleton" />

    <section v-else-if="loadError" class="detail-error" role="alert">
      <h1>旅行详情加载失败</h1>
      <p>请检查网络连接后重新加载</p>
      <div class="detail-error-actions">
        <button type="button" class="error-action secondary" @click="router.push('/trips')">返回旅行列表</button>
        <button type="button" class="error-action primary" aria-label="重新加载旅行详情" @click="loadTrip">重新加载</button>
      </div>
    </section>

    <div v-else-if="trip" class="detail-content">
      <button type="button" class="back-btn" aria-label="返回旅行列表" @click="router.push('/trips')">
        <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
        <span>返回旅行列表</span>
      </button>

      <!-- ===== Hero ===== -->
      <header class="journey-hero" :class="{ 'no-cover': !trip.cover_photo_url }">
        <div v-if="trip.cover_photo_url" class="hero-cover">
          <AuthenticatedImage :src="trip.cover_photo_url" :alt="trip.title" class="hero-cover-img" />
          <div class="hero-shade" aria-hidden="true"></div>
        </div>
        <div class="hero-body">
          <p class="hero-kicker">旅行记录</p>
          <h1 class="trip-title">{{ trip.title }}</h1>
          <p class="meta-date">{{ trip.start_date }} 至 {{ trip.end_date }}</p>
          <div v-if="tripCities.length" class="hero-route" aria-label="途经城市">
            <span v-for="city in tripCities" :key="city" class="hero-city">{{ city }}</span>
          </div>
          <p v-if="trip.description" class="meta-desc">{{ trip.description }}</p>

          <div class="hero-foot">
            <dl class="hero-stats" aria-label="旅行概览">
              <div>
                <dt>行程</dt>
                <dd>{{ durationDays ? `${durationDays} 天` : '—' }}</dd>
              </div>
              <div>
                <dt>地点</dt>
                <dd>{{ trip.locations.length }} 个</dd>
              </div>
              <div>
                <dt>城市</dt>
                <dd>{{ tripCities.length }} 座</dd>
              </div>
            </dl>

            <div class="header-actions" aria-label="旅行操作">
              <button type="button" class="action-btn primary" @click="goToEdit">
                <el-icon aria-hidden="true"><Edit /></el-icon>
                <span>编辑</span>
              </button>
              <button type="button" class="action-btn secondary" @click="showExportDialog = true">
                <el-icon aria-hidden="true"><Download /></el-icon>
                <span>导出</span>
              </button>
              <button type="button" class="action-btn secondary" @click="handleShare">
                <el-icon aria-hidden="true"><Share /></el-icon>
                <span>分享</span>
              </button>
              <button type="button" class="action-btn danger" @click="handleDelete">
                <el-icon aria-hidden="true"><Delete /></el-icon>
                <span>删除</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- ===== 照片条 ===== -->
      <section v-if="allPhotosLoaded && allPhotos.length > 0" class="photo-strip-section" aria-label="全部照片">
        <div class="strip-head">
          <h2 class="strip-title">照片墙</h2>
          <span class="strip-count">{{ allPhotos.length }} 张</span>
        </div>
        <div class="photo-strip" role="list">
          <button
            v-for="(item, index) in allPhotos"
            :key="item.photo.id"
            type="button"
            role="listitem"
            class="strip-item"
            :aria-label="`查看照片：${item.locationName}`"
            @click="openStripViewer(index)"
          >
            <AuthenticatedImage
              :src="item.photo.thumbnail_url"
              :alt="item.photo.file_name"
              loading="lazy"
            />
            <span class="strip-location">{{ item.locationName }}</span>
          </button>
        </div>
      </section>

      <!-- ===== 行程路线 ===== -->
      <section class="route-section" aria-labelledby="route-heading">
        <div class="route-heading-row">
          <div>
            <p class="section-kicker">足迹路线</p>
            <h2 id="route-heading" class="route-heading">按地点重访这次旅行</h2>
          </div>
          <span class="route-count" :class="{ saving: sortSaving }">
            {{ sortSaving ? '保存顺序中…' : `${trip.locations.length} 站 · 拖动卡片可调整顺序` }}
          </span>
        </div>

        <div v-if="trip.locations.length === 0" class="route-empty">
          <p class="route-empty-title">还没有添加地点</p>
          <p class="route-empty-description">添加沿途地点后，这里会形成完整的足迹路线</p>
          <button type="button" class="route-empty-action" aria-label="为这次旅行添加地点" @click="goToEdit">
            添加地点
          </button>
        </div>
        <ol v-else class="locations-list">
          <li
            v-for="(loc, index) in trip.locations"
            :key="loc.id"
            class="location-section"
            draggable="true"
            :class="{
              dragging: dragIndex === index,
              'drag-over': overIndex === index && dragIndex !== null && dragIndex !== index,
            }"
            @dragstart="onDragStart(index, $event)"
            @dragenter.prevent="onDragEnter(index)"
            @dragover.prevent
            @drop.prevent="onDrop"
            @dragend="onDragEnd"
          >
            <button
              :id="`location-toggle-${loc.id}`"
              type="button"
              class="location-toggle"
              :aria-expanded="expandedLocations.has(loc.id)"
              :aria-controls="`location-panel-${loc.id}`"
              :aria-label="`${expandedLocations.has(loc.id) ? '收起' : '展开'}地点：${loc.name}`"
              @click="toggleLocation(loc)"
            >
              <span class="drag-handle" title="拖动调整顺序" aria-hidden="true">
                <el-icon><Rank /></el-icon>
              </span>
              <span class="location-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="location-text">
                <span class="location-name">{{ loc.name }}</span>
                <span class="location-city">{{ loc.city }} · {{ loc.province }}</span>
              </span>
              <span class="location-summary">{{ loc.photo_count || 0 }} 张照片</span>
              <el-icon class="expand-icon" :class="{ expanded: expandedLocations.has(loc.id) }" aria-hidden="true">
                <ArrowDown />
              </el-icon>
            </button>

            <transition name="expand">
              <div
                v-if="expandedLocations.has(loc.id)"
                :id="`location-panel-${loc.id}`"
                class="location-body"
                role="region"
                :aria-labelledby="`location-toggle-${loc.id}`"
              >
                <section class="photos-section" aria-label="照片">
                  <h3 class="section-label">照片</h3>
                  <div class="photos-grid">
                    <div
                      v-for="(photo, pIndex) in (locationPhotos[loc.id] || [])"
                      :key="photo.id"
                      class="photo-item"
                    >
                      <button
                        type="button"
                        class="photo-viewer-trigger"
                        :aria-label="`查看照片：${photo.file_name}`"
                        @click="openViewer(locationPhotos[loc.id] || [], pIndex)"
                      >
                        <AuthenticatedImage
                          :src="photo.thumbnail_url"
                          :alt="photo.file_name"
                          loading="lazy"
                        />
                      </button>
                      <div class="photo-overlay">
                        <button
                          type="button"
                          class="photo-delete"
                          :aria-label="`删除照片：${photo.file_name}`"
                          @click.stop="handleDeletePhoto(photo.id, loc.id)"
                        >
                          <el-icon aria-hidden="true"><Delete /></el-icon>
                        </button>
                      </div>
                    </div>
                    <el-upload
                      :show-file-list="false"
                      :before-upload="beforeUpload(loc.id)"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      class="upload-card"
                    >
                      <div class="upload-trigger">
                        <el-icon aria-hidden="true"><Plus /></el-icon>
                        <span>上传照片</span>
                      </div>
                    </el-upload>
                  </div>
                </section>

                <section v-if="loc.note" class="note-section" aria-label="游记">
                  <h3 class="section-label">游记</h3>
                  <div class="markdown-body" v-html="renderNote(loc.note)"></div>
                </section>
              </div>
            </transition>
          </li>
        </ol>
      </section>
    </div>

    <PhotoViewer
      :photos="viewerPhotos"
      :index="viewerIndex"
      :visible="showPhotoViewer"
      @close="showPhotoViewer = false"
      @update:index="viewerIndex = $event"
    />

    <el-dialog v-model="showExportDialog" title="导出旅行" width="400px">
      <div class="export-dialog">
        <div class="export-options">
          <button type="button" class="export-option" @click="handleExport('json')">
            <span class="export-option-icon" aria-hidden="true"><el-icon><Document /></el-icon></span>
            <span class="export-option-info">
              <span class="export-option-name">导出为 JSON</span>
              <span class="export-option-desc">数据备份，可重新导入</span>
            </span>
          </button>
          <button type="button" class="export-option" @click="handleExport('markdown')">
            <span class="export-option-icon" aria-hidden="true"><el-icon><FolderOpened /></el-icon></span>
            <span class="export-option-info">
              <span class="export-option-name">导出为 Markdown</span>
              <span class="export-option-desc">含照片的压缩包</span>
            </span>
          </button>
        </div>
      </div>
    </el-dialog>
  </main>
</template>

<style scoped>
.detail-page {
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-lg) clamp(20px, 4vw, 48px) var(--space-3xl);
  outline: none;
}

.detail-skeleton {
  padding-top: var(--space-lg);
}

/* ========== 返回 ========== */
.back-btn {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 var(--space-md) -12px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: color var(--dur-base) var(--ease-out), background-color var(--dur-base) var(--ease-out);
}

.back-btn:hover {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

/* ========== Hero ========== */
.journey-hero {
  position: relative;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-lg);
}

.hero-cover {
  position: absolute;
  inset: 0;
}

.hero-cover :deep(.hero-cover-img) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hero-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(10, 16, 13, 0.88) 0%,
    rgba(10, 16, 13, 0.55) 45%,
    rgba(10, 16, 13, 0.18) 100%
  );
}

.hero-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 380px;
  justify-content: flex-end;
  padding: var(--space-2xl) clamp(var(--space-lg), 4vw, var(--space-2xl)) var(--space-lg);
  color: #f4f2ec;
}

.journey-hero.no-cover .hero-body {
  min-height: 0;
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--color-primary) 26%, transparent) 0%, transparent 55%),
    var(--color-surface);
  color: var(--color-ink);
}

.journey-hero.no-cover .meta-date,
.journey-hero.no-cover .meta-desc,
.journey-hero.no-cover .hero-stats dd {
  color: var(--color-ink-secondary);
}

.journey-hero.no-cover .hero-city {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
}

.journey-hero.no-cover .hero-stats {
  border-color: var(--color-border);
}

.hero-kicker {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.24em;
  color: var(--color-accent);
  text-transform: uppercase;
  margin-bottom: var(--space-sm);
}

.trip-title {
  font-size: var(--text-3xl);
  line-height: var(--lh-3xl);
  font-weight: 700;
  color: inherit;
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.35);
}

.journey-hero.no-cover .trip-title {
  text-shadow: none;
}

.meta-date {
  margin-top: var(--space-sm);
  font-size: var(--text-sm);
  letter-spacing: 0.12em;
  color: rgba(244, 242, 236, 0.82);
}

.hero-route {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: var(--space-md);
}

.hero-city {
  padding: 4px 12px;
  border: 1px solid rgba(244, 242, 236, 0.35);
  border-radius: 999px;
  background: rgba(244, 242, 236, 0.12);
  backdrop-filter: blur(4px);
  color: #f4f2ec;
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
}

.meta-desc {
  margin-top: var(--space-md);
  max-width: 640px;
  font-size: var(--text-base);
  line-height: 1.7;
  color: rgba(244, 242, 236, 0.88);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hero-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-lg);
  margin-top: var(--space-lg);
  padding-top: var(--space-md);
  border-top: 1px solid rgba(244, 242, 236, 0.22);
  flex-wrap: wrap;
}

.journey-hero.no-cover .hero-foot {
  border-top-color: var(--color-border);
}

.hero-stats {
  display: flex;
  gap: var(--space-xl);
}

.hero-stats dt {
  font-size: var(--text-xs);
  letter-spacing: 0.14em;
  color: rgba(244, 242, 236, 0.68);
  margin-bottom: 2px;
}

.hero-stats dd {
  font-family: var(--font-serif);
  font-size: var(--text-md);
  font-weight: 700;
  color: #f4f2ec;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color var(--dur-base) var(--ease-out),
    color var(--dur-base) var(--ease-out),
    border-color var(--dur-base) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.action-btn:active {
  transform: scale(0.97);
}

.action-btn.primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.action-btn.primary:hover {
  background: var(--color-primary-hover);
  box-shadow: var(--shadow-primary);
}

.action-btn.secondary {
  background: rgba(244, 242, 236, 0.14);
  border-color: rgba(244, 242, 236, 0.4);
  color: #f4f2ec;
  backdrop-filter: blur(4px);
}

.action-btn.secondary:hover {
  background: rgba(244, 242, 236, 0.26);
}

.journey-hero.no-cover .action-btn.secondary {
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  color: var(--color-ink-secondary);
}

.journey-hero.no-cover .action-btn.secondary:hover {
  background: var(--color-surface-muted);
}

.action-btn.danger {
  background: transparent;
  border-color: rgba(244, 242, 236, 0.4);
  color: #ffb4a6;
}

.action-btn.danger:hover {
  background: rgba(179, 64, 46, 0.28);
  border-color: rgba(255, 180, 166, 0.6);
}

.journey-hero.no-cover .action-btn.danger {
  color: var(--color-danger);
  border-color: color-mix(in srgb, var(--color-danger) 40%, transparent);
}

.journey-hero.no-cover .action-btn.danger:hover {
  background: var(--color-danger-soft);
}

/* ========== 照片条 ========== */
.photo-strip-section {
  margin-bottom: var(--space-2xl);
}

.strip-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.strip-title {
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  font-weight: 700;
}

.strip-count {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  letter-spacing: 0.1em;
}

.photo-strip {
  display: flex;
  gap: var(--space-sm);
  overflow-x: auto;
  padding-bottom: var(--space-sm);
  scrollbar-width: thin;
}

.strip-item {
  position: relative;
  flex: 0 0 150px;
  aspect-ratio: 3 / 4;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-surface-muted);
  cursor: zoom-in;
}

.strip-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 360ms var(--ease-out);
}

.strip-item:hover img {
  transform: scale(1.05);
}

.strip-location {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 22px 10px 8px;
  background: linear-gradient(to top, rgba(10, 16, 13, 0.78), transparent);
  color: #f4f2ec;
  font-size: var(--text-xs);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ========== 行程路线 ========== */
.route-section {
  margin-bottom: var(--space-2xl);
}

.route-heading-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.section-kicker {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.22em;
  color: var(--color-accent);
  margin-bottom: 4px;
}

.route-heading {
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  font-weight: 700;
}

.route-count {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  letter-spacing: 0.05em;
}

.route-count.saving {
  color: var(--color-primary);
}

.route-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-3xl) var(--space-lg);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  text-align: center;
}

.route-empty-title {
  font-family: var(--font-serif);
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--color-ink);
}

.route-empty-description {
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}

.route-empty-action {
  margin-top: var(--space-sm);
  height: 40px;
  padding: 0 24px;
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--dur-base) ease, box-shadow var(--dur-base) ease;
}

.route-empty-action:hover {
  background: var(--color-primary-hover);
  box-shadow: var(--shadow-primary);
}

/* ========== 地点行程轴 ========== */
.locations-list {
  list-style: none;
  position: relative;
}

.locations-list::before {
  content: '';
  position: absolute;
  left: 37px;
  top: 28px;
  bottom: 28px;
  width: 1px;
  background: var(--color-border);
}

.location-section {
  position: relative;
  margin-bottom: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
  transition: border-color var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out),
    opacity var(--dur-base) ease;
}

.location-section.dragging {
  opacity: 0.45;
}

.location-section.drag-over {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-soft);
}

.location-section:last-child {
  margin-bottom: 0;
}

.location-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
  min-height: 68px;
  padding: var(--space-sm) var(--space-lg) var(--space-sm) var(--space-md);
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dur-fast) ease;
}

.location-toggle:hover {
  background: color-mix(in srgb, var(--color-primary-soft) 45%, transparent);
}

.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-xs);
  color: var(--color-ink-muted);
  cursor: grab;
  opacity: 0;
  transition: opacity var(--dur-fast) ease, color var(--dur-fast) ease, background-color var(--dur-fast) ease;
}

.location-toggle:hover .drag-handle {
  opacity: 1;
}

.drag-handle:hover {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.drag-handle:active {
  cursor: grabbing;
}

.location-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1.5px solid var(--color-primary);
  background: var(--color-surface);
  color: var(--color-primary);
  font-family: var(--font-serif);
  font-size: var(--text-sm);
  font-weight: 700;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.location-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.location-name {
  font-family: var(--font-serif);
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--color-ink);
}

.location-city {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  letter-spacing: 0.05em;
}

.location-summary {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.expand-icon {
  font-size: 15px;
  color: var(--color-ink-muted);
  transition: transform var(--dur-base) var(--ease-out);
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

/* ========== 展开体：照片在上，游记在下；桌面双栏 ========== */
.location-body {
  border-top: 1px solid var(--color-border);
  padding: var(--space-lg);
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--space-xl);
  align-items: start;
}

/* 无游记时照片通栏 */
.location-body .photos-section:last-child {
  grid-column: 1 / -1;
}

.section-label {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.18em;
  color: var(--color-ink-muted);
  margin-bottom: var(--space-md);
}

/* 照片网格 */
.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: var(--space-sm);
}

.photo-item {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-surface-muted);
}

.photo-viewer-trigger {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  cursor: zoom-in;
  background: var(--color-surface-muted);
}

.photo-viewer-trigger :deep(img),
.photo-viewer-trigger img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 360ms var(--ease-out);
}

.photo-viewer-trigger:hover img {
  transform: scale(1.04);
}

.photo-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 6px;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--dur-fast) ease;
}

.photo-item:hover .photo-overlay {
  opacity: 1;
}

.photo-delete {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 999px;
  background: rgba(12, 18, 15, 0.62);
  color: #fff;
  cursor: pointer;
  transition: background-color var(--dur-fast) ease;
}

.photo-delete:hover {
  background: var(--color-danger);
}

.upload-card :deep(.el-upload) {
  width: 100%;
}

.upload-trigger {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  min-height: 111px;
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
  transition: color var(--dur-base) ease, border-color var(--dur-base) ease;
}

.upload-trigger:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.upload-trigger .el-icon {
  font-size: 20px;
}

/* ========== 加载失败 ========== */
.detail-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-3xl) var(--space-lg);
  text-align: center;
}

.detail-error h1 {
  font-size: var(--text-lg);
}

.detail-error p {
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
}

.detail-error-actions {
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.error-action {
  height: 40px;
  padding: 0 22px;
  border-radius: 999px;
  font-size: var(--text-sm);
  cursor: pointer;
  border: 1px solid transparent;
}

.error-action.primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.error-action.secondary {
  background: transparent;
  border-color: var(--color-border-strong);
  color: var(--color-ink-secondary);
}

/* ========== 导出对话框 ========== */
.export-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.export-option {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--dur-fast) ease, background-color var(--dur-fast) ease;
}

.export-option:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.export-option-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  color: var(--color-primary);
  font-size: 20px;
  flex-shrink: 0;
}

.export-option-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.export-option-name {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-ink);
}

.export-option-desc {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
}

/* ========== 过渡 ========== */
.expand-enter-active,
.expand-leave-active {
  transition: opacity var(--dur-base) var(--ease-out);
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
}

/* ========== 响应式 ========== */
@media (max-width: 900px) {
  .location-body {
    grid-template-columns: 1fr;
    gap: var(--space-lg);
  }
}

@media (max-width: 768px) {
  .detail-page {
    padding: var(--space-md) var(--space-md) var(--space-2xl);
  }

  .hero-body {
    min-height: 300px;
    padding: var(--space-xl) var(--space-lg) var(--space-lg);
  }

  .trip-title {
    font-size: var(--text-xl);
    line-height: var(--lh-xl);
  }

  .hero-foot {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    justify-content: stretch;
  }

  .header-actions .action-btn {
    flex: 1;
    justify-content: center;
    padding: 0 10px;
  }

  .hero-stats {
    gap: var(--space-lg);
  }

  .locations-list::before {
    left: 27px;
  }

  .location-index {
    width: 30px;
    height: 30px;
    font-size: var(--text-xs);
  }

  .drag-handle {
    display: none;
  }

  .route-count {
    display: none;
  }

  .location-body {
    padding: var(--space-md);
  }
}
</style>
