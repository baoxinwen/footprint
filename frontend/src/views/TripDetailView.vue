<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTrip, deleteTrip, updateSortOrder } from '../api/trips'
import { uploadPhoto, getPhotos, deletePhoto } from '../api/photos'
import { createShare } from '../api/shares'
import type { TripDetail, Location, Photo } from '../types'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowDown,
  ArrowLeft,
  Check,
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
import { clearPrivateCaches, forgetCachedThumbnail } from '../utils/pwa'
import request from '../api/request'
import PhotoViewer from '../components/PhotoViewer.vue'
import AuthenticatedImage from '../components/AuthenticatedImage.vue'
import SkeletonList from '../components/SkeletonList.vue'
import TripHero from '../components/TripHero.vue'

const route = useRoute()
const router = useRouter()
const tripId = computed(() => Number(route.params.id))
const trip = ref<TripDetail | null>(null)
const loading = ref(true)
const loadError = ref(false)
const expandedLocations = ref<Set<number>>(new Set())
// 过渡结束后行值落定为 auto：fr 轨道在「过渡期间内容高度再变化」时可能停在陈旧值，
// 被卡片 overflow:hidden 裁掉、滚动后才自愈；落定后任何内容变化原生撑开，无冻结窗口
const settledLocations = ref<Set<number>>(new Set())
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
    ElMessage.error('加载旅行详情失败，请稍后重试')
  } finally {
    if (generation === tripLoadGeneration) loading.value = false
  }
}

function resetTripState() {
  trip.value = null
  expandedLocations.value = new Set()
  settledLocations.value = new Set()
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

/* ---------- 折叠状态机（铁律 7 的 Grid 行过渡，全 px 行内驱动） ----------
   开/关/中途反转统一走「读当前高 → 钉 px 基线 → 渲染一帧 → 目标 px」，
   不依赖 CSS transition 的自动反向与 fr 插值边界（两者在快速连点下
   会把行高冻在陈旧值，被卡片 overflow:hidden 裁掉、滚动后才自愈）。
   过渡结束后行值落定 auto：内容高度再变化（照片到达、图片加载）原生撑开。 */

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

function onCollapseTransitionEnd(loc: Location, event: TransitionEvent) {
  if (event.propertyName !== 'grid-template-rows') return
  const el = document.getElementById(`location-collapse-${loc.id}`)
  if (!el) return
  if (expandedLocations.value.has(loc.id)) {
    settledLocations.value.add(loc.id)
    el.style.gridTemplateRows = '' // 展开到位：落定 auto（内容变化原生撑开）
  } else {
    el.style.gridTemplateRows = '' // 收起到位：交还类的 0fr
  }
}

// 每个 location 的折叠操作代际：快速连点时新旧 toggle 的 async 延续并发交错，
// 恢复执行后的行内写入必须校验代际，过期者放弃（否则旧延续会把新目标改回旧值）
const collapseGen = new Map<number, number>()

async function toggleLocation(loc: Location) {
  const gen = (collapseGen.get(loc.id) ?? 0) + 1
  collapseGen.set(loc.id, gen)
  const el = document.getElementById(`location-collapse-${loc.id}`)
  const pin = () => {
    if (el) el.style.gridTemplateRows = `${Math.round(el.getBoundingClientRect().height)}px`
  }
  if (expandedLocations.value.has(loc.id)) {
    pin() // 钉当前高（可能是中途插值），基线帧后收合到 0px
    settledLocations.value.delete(loc.id)
    expandedLocations.value.delete(loc.id)
    await nextTick()
    await nextFrame()
    if (el && collapseGen.get(loc.id) === gen) el.style.gridTemplateRows = '0px'
  } else {
    pin() // 钉当前高（0 或中途值）
    settledLocations.value.delete(loc.id)
    expandedLocations.value.add(loc.id)
    await nextTick()
    await nextFrame()
    if (collapseGen.get(loc.id) !== gen) return
    // 目标高 = 内容固有高度：行高被压 0 时 wrap.scrollHeight 也是 0，
    // 必须读 clip 的 scrollHeight，否则目标 '0px' 无过渡可跑、面板卡死
    const clip = el?.querySelector('.location-collapse-clip')
    const target = clip ? clip.scrollHeight : (el?.scrollHeight ?? 0)
    if (el) el.style.gridTemplateRows = `${target}px`
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
    ElMessage.error('加载照片失败，请稍后重试')
  }
}

const uploadingLocations = ref<Set<number>>(new Set())

// 上传/删除成功后同步地点行的照片计数，否则摘要栏会一直显示旧值
function bumpPhotoCount(locationId: number, delta: number) {
  const loc = trip.value?.locations.find((item) => item.id === locationId)
  if (loc) loc.photo_count = Math.max(0, (loc.photo_count || 0) + delta)
}

async function handleUpload(locationId: number, file: File) {
  if (uploadingLocations.value.has(locationId)) {
    ElMessage.warning('当前地点正在上传中，请稍候')
    return
  }
  uploadingLocations.value.add(locationId)
  try {
    await uploadPhoto(locationId, file)
    ElMessage.success('已上传')
    bumpPhotoCount(locationId, 1)
    loadPhotos(locationId)
  } catch {
    ElMessage.error('上传照片失败，请稍后重试')
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
    await ElMessageBox.confirm(
      '这张照片将永久删除，无法恢复。',
      '删除照片',
      { type: 'warning', confirmButtonText: '删除照片', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deletePhoto(photoId)
    ElMessage.success('已删除照片')
    // 缩略图是缓存优先的：不清的话已删除的照片离线时仍能看到
    void forgetCachedThumbnail(photoId)
    bumpPhotoCount(locationId, -1)
    loadPhotos(locationId)
  } catch {
    ElMessage.error('删除照片失败，请稍后重试')
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
      `删除「${trip.value?.title ?? ''}」？`,
      { type: 'warning', confirmButtonText: '删除旅行', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    await deleteTrip(tripId.value)
    ElMessage.success('已删除旅行')
    // 旅行连同地点、照片一起删了：离线缓存里它的接口快照与缩略图一并清掉
    void clearPrivateCaches()
    router.push('/trips')
  } catch {
    ElMessage.error('删除旅行失败，请稍后重试')
  }
}

async function handleShare() {
  let url: string
  try {
    const { data } = await createShare(tripId.value)
    url = absoluteUrl(`/share/${data.token}`)
  } catch {
    ElMessage.error('创建分享链接失败，请稍后重试')
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    // 铁律 10：按钮内对勾反馈，2.5s 后自熄恢复，不再弹 toast
    shareCopied.value = true
    shareCopiedFading.value = false
    window.clearTimeout(shareCopiedTimer)
    shareCopiedTimer = window.setTimeout(() => {
      shareCopiedFading.value = true
      shareCopiedTimer = window.setTimeout(() => {
        shareCopied.value = false
        shareCopiedFading.value = false
      }, 260)
    }, 2500)
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
    ElMessage.error('导出失败，请稍后重试')
  }
  showExportDialog.value = false
}

/* ---------- 分享复制反馈（铁律 9/10：欠阻尼微弹入场，2.5s 自熄） ---------- */
const shareCopied = ref(false)
const shareCopiedFading = ref(false)
let shareCopiedTimer = 0

/* ---------- 排序（PRD 5.6）：鼠标拖拽 + 键盘 Alt+↑/↓ 双路径，共用一套重排逻辑 ---------- */
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)
const sortSaving = ref(false)
// aria-live 播报：键盘重排完成后读屏用户需要听到结果（视觉用户能看到列表移动）
const sortAnnouncement = ref('')

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

async function moveLocation(from: number, to: number) {
  if (from === to || !trip.value) return
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
    sortAnnouncement.value = `已将「${moved.name}」移动到第 ${to + 1} 位`
    ElMessage.success('顺序已保存')
  } catch {
    sortAnnouncement.value = '顺序保存失败，已恢复原顺序'
    ElMessage.error('顺序保存失败，请稍后重试')
    loadTrip()
  } finally {
    sortSaving.value = false
  }
}

async function onDrop() {
  const from = dragIndex.value
  const to = overIndex.value
  dragIndex.value = null
  overIndex.value = null
  if (from === null || to === null) return
  await moveLocation(from, to)
}

/** 键盘替代拖拽：聚焦地点行后按 Alt+↑/↓ 移动该项（WCAG 2.1.1） */
async function onLocationKeydown(index: number, event: KeyboardEvent) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  event.preventDefault()
  if (!trip.value) return
  const to = event.key === 'ArrowUp' ? index - 1 : index + 1
  if (to < 0 || to >= trip.value.locations.length) return
  await moveLocation(index, to)
  // 焦点跟手：列表重排后焦点移动到该项的新位置，继续按可连续调整
  await nextTick()
  const moved = trip.value.locations[to]
  if (moved) document.getElementById(`location-toggle-${moved.id}`)?.focus()
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

      <!-- ===== Hero（TripHero 共享组件，颜色经 --hero-* 上下文变量传入插槽） ===== -->
      <TripHero
        kicker="旅行记录"
        :title="trip.title"
        :start-date="trip.start_date"
        :end-date="trip.end_date"
        :cover-url="trip.cover_photo_url ?? undefined"
        cover-authenticated
        :cities="tripCities"
        :description="trip.description ?? undefined"
      >
        <template #foot>
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
              <button
                type="button"
                class="action-btn secondary"
                :aria-label="shareCopied ? '分享链接已复制' : '创建分享链接'"
                @click="handleShare"
              >
                <el-icon v-if="!shareCopied" aria-hidden="true"><Share /></el-icon>
                <el-icon
                  v-else
                  aria-hidden="true"
                  class="pop-check share-copied"
                  :class="{ 'is-fading': shareCopiedFading }"
                ><Check /></el-icon>
                <span>{{ shareCopied ? '已复制' : '分享' }}</span>
              </button>
              <button type="button" class="action-btn danger" @click="handleDelete">
                <el-icon aria-hidden="true"><Delete /></el-icon>
                <span>删除</span>
              </button>
            </div>
          </div>
        </template>
      </TripHero>

      <!-- ===== 照片条 ===== -->
      <section v-if="allPhotosLoaded && allPhotos.length > 0" class="photo-strip-section" aria-label="全部照片">
        <div class="strip-head">
          <h2 class="strip-title">照片墙</h2>
          <span class="strip-count">{{ allPhotos.length }} 张</span>
        </div>
        <div class="photo-strip">
          <button
            v-for="(item, index) in allPhotos"
            :key="item.photo.id"
            type="button"
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
            {{ sortSaving ? '保存顺序中…' : `${trip.locations.length} 站 · 拖动或聚焦后按 Alt+↑/↓ 调整顺序` }}
          </span>
          <!-- 键盘排序结果播报（视觉用户直接看到列表移动） -->
          <span class="visually-hidden" role="status">{{ sortAnnouncement }}</span>
        </div>

        <div v-if="trip.locations.length === 0" class="route-empty">
          <p class="route-empty-title">还没有添加地点</p>
          <p class="route-empty-description">添加沿途地点后，这里会形成完整的足迹路线</p>
          <button type="button" class="route-empty-action" aria-label="为这次旅行添加地点" @click="goToEdit">
            添加地点
          </button>
        </div>
        <TransitionGroup v-else tag="ol" name="locations" class="locations-list">
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
              @keydown="onLocationKeydown(index, $event)"
            >
              <span class="drag-handle" title="拖动调整顺序" aria-hidden="true">
                <el-icon><Rank /></el-icon>
              </span>
              <span class="location-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="location-text">
                <span class="location-name">{{ loc.name }}</span>
                <span class="location-city">{{ loc.city }} · {{ loc.province }}</span>
              </span>
              <span class="location-summary tnums">{{ loc.photo_count || 0 }} 张照片</span>
              <el-icon class="expand-icon" :class="{ expanded: expandedLocations.has(loc.id) }" aria-hidden="true">
                <ArrowDown />
              </el-icon>
            </button>

            <!-- 铁律 7：Grid 0fr→1fr 过渡折叠，免 JS 算高；收起内容 inert 防聚焦 -->
            <div
              :id="`location-collapse-${loc.id}`"
              class="location-collapse"
              :class="{ open: expandedLocations.has(loc.id), settled: settledLocations.has(loc.id) }"
              :inert="!expandedLocations.has(loc.id)"
              :aria-hidden="!expandedLocations.has(loc.id)"
              @transitionend="onCollapseTransitionEnd(loc, $event)"
            >
              <div class="location-collapse-clip">
                <div
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
              </div>
            </div>
          </li>
        </TransitionGroup>
      </section>
    </div>

    <PhotoViewer
      :photos="viewerPhotos"
      :index="viewerIndex"
      :visible="showPhotoViewer"
      @close="showPhotoViewer = false"
      @update:index="viewerIndex = $event"
    />

    <!-- 宽度上限留出边距，320px 视口不裁剪导出操作 -->
    <el-dialog
      v-model="showExportDialog"
      title="导出旅行"
      width="min(400px, calc(100vw - 32px))"
    >
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

/* ========== Hero 插槽内容（hero 本体样式在 TripHero 组件内，取色走 --hero-* 上下文变量） ========== */
.hero-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-lg);
  margin-top: var(--space-lg);
  padding-top: var(--space-md);
  border-top: 1px solid var(--hero-border);
  flex-wrap: wrap;
}

.hero-stats {
  display: flex;
  gap: var(--space-xl);
}

.hero-stats dt {
  font-size: var(--text-xs);
  letter-spacing: 0.14em;
  color: var(--hero-text-faint);
  margin-bottom: 2px;
}

.hero-stats dd {
  font-family: var(--font-serif);
  font-size: var(--text-md);
  font-weight: var(--fw-bold);
  color: var(--hero-text);
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
  font-weight: var(--fw-medium);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color var(--dur-base) var(--ease-out),
    color var(--dur-base) var(--ease-out),
    border-color var(--dur-base) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.action-btn:active:not(:disabled) {
  transform: scale(0.96);
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
  background: var(--hero-btn-bg);
  border-color: var(--hero-border-strong);
  color: var(--hero-text);
  backdrop-filter: blur(4px);
}

.action-btn.secondary:hover {
  background: var(--hero-btn-bg-hover);
}

.action-btn.danger {
  background: transparent;
  border-color: var(--hero-danger-border);
  color: var(--hero-danger-text);
}

.action-btn.danger:hover {
  background: var(--hero-danger-bg-hover);
  border-color: var(--hero-danger-border);
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
  font-weight: var(--fw-bold);
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
  transition: transform var(--dur-expand) var(--ease-out);
}

.strip-item:hover img {
  transform: scale(1.04);
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
  font-weight: var(--fw-semibold);
  letter-spacing: 0.22em;
  color: var(--color-accent);
  margin-bottom: 4px;
}

.route-heading {
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  font-weight: var(--fw-bold);
}

.route-count {
  font-variant-numeric: tabular-nums;
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
  font-weight: var(--fw-semibold);
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
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition: background-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
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
  /* 铁律 1：去边框，卡片面靠 surface/canvas 明度差 + 阴影分层 */
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
  transition: box-shadow var(--dur-base) var(--ease-out),
    opacity var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.location-section.dragging {
  opacity: 0.45;
}

/* 拖拽中的目标卡：双环咬合提示落点 */
.location-section.drag-over {
  box-shadow:
    inset 0 0 0 1px var(--color-primary),
    0 0 0 3px color-mix(in srgb, var(--color-primary) 14%, transparent);
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
  transition: background-color var(--dur-fast) var(--ease-out);
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
  transition: opacity var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
}

.location-toggle:hover .drag-handle,
.location-toggle:focus-visible .drag-handle {
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
  font-variant-numeric: tabular-nums;
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
  font-weight: var(--fw-bold);
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
  font-weight: var(--fw-semibold);
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
  font-size: var(--text-base);
  color: var(--color-ink-muted);
  transition: transform var(--dur-base) var(--ease-out);
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

/* ========== 展开体：照片在上，游记在下；桌面双栏 ========== */
.location-body {
  border-top: 1px solid color-mix(in srgb, var(--color-ink) 7%, transparent);
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
  font-weight: var(--fw-semibold);
  letter-spacing: 0.22em;
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
  transition: transform var(--dur-expand) var(--ease-out);
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
  transition: opacity var(--dur-fast) var(--ease-out);
}

/* 照片网格习语（同 PhotoViewer/PhotoGrid 旧习语）：hover 显现之外，
   键盘聚焦删除钮也要显现，触屏（无 hover）常显——否则焦点/删除钮不可见 */
.photo-item:hover .photo-overlay,
.photo-item:focus-within .photo-overlay {
  opacity: 1;
}

@media (hover: none) {
  .photo-overlay {
    opacity: 1;
  }
}

.photo-delete {
  position: relative; /* 热区伪元素的定位基准 */
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 999px;
  background: rgba(10, 10, 9, 0.62);
  color: #fff;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out);
}

/* 触控热区向外扩 7px 到 44x44（视觉不变）：30px 的圆钮在触屏上太难点中 */
.photo-delete::before {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: 999px;
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
  transition: color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out);
}

.upload-trigger:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.upload-trigger .el-icon {
  font-size: var(--text-lg);
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
  transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
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
  font-size: var(--text-lg);
  flex-shrink: 0;
}

.export-option-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.export-option-name {
  font-size: var(--text-base);
  font-weight: var(--fw-medium);
  color: var(--color-ink);
}

.export-option-desc {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
}

/* ========== 过渡 ========== */
/* 铁律 7：Grid 0fr→1fr 折叠，高度过渡交给浏览器，免 JS 测高 */
.location-collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-expand) var(--ease-out);
}

.location-collapse.open {
  grid-template-rows: 1fr;
}

/* 展开过渡结束后的落定态：行值转 auto（与 1fr 解析同高、零跳动）。
   此后内容高度变化（照片到达、Markdown 图片加载）原生撑开容器，
   不会触发 fr 轨道冻结被卡片裁切的病灶 */
.location-collapse.open.settled {
  grid-template-rows: auto;
  transition: none;
}

.location-collapse-clip {
  overflow: hidden;
  min-height: 0;
}

/* 铁律 9：拖拽归位走 过阻尼弹簧，零回弹咬死 */
.locations-move {
  transition: transform var(--dur-settle) var(--ease-settle);
}

/* 分享对勾自熄：淡出后图标复位（铁律 10） */
.share-copied {
  color: var(--color-primary);
  transition: opacity var(--dur-base) var(--ease-out);
}

.share-copied.is-fading {
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
  font-variant-numeric: tabular-nums;
    width: 30px;
    height: 30px;
    font-size: var(--text-xs);
  }

  .drag-handle {
    display: none;
  }

  .route-count {
  font-variant-numeric: tabular-nums;
    display: none;
  }

  .location-body {
    padding: var(--space-md);
  }
}
</style>
