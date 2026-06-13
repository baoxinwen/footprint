<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTrip, deleteTrip } from '../api/trips'
import { uploadPhoto, getPhotos, deletePhoto } from '../api/photos'
import { createShare } from '../api/shares'
import type { TripDetail, Location, Photo } from '../types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { renderMarkdown } from '../utils/markdown'
import request from '../api/request'
import PhotoViewer from '../components/PhotoViewer.vue'

const route = useRoute()
const router = useRouter()
const tripId = Number(route.params.id)
const trip = ref<TripDetail | null>(null)
const loading = ref(true)
const expandedLocations = ref<Set<number>>(new Set())
const locationPhotos = ref<Record<number, Photo[]>>({})
const showPhotoViewer = ref(false)
const viewerPhotos = ref<Photo[]>([])
const viewerIndex = ref(0)
const showExportDialog = ref(false)

onMounted(async () => {
  try {
    const { data } = await getTrip(tripId)
    trip.value = data
  } catch {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
})

function toggleLocation(loc: Location) {
  if (expandedLocations.value.has(loc.id)) {
    expandedLocations.value.delete(loc.id)
  } else {
    expandedLocations.value.add(loc.id)
    loadPhotos(loc.id)
  }
}

async function loadPhotos(locationId: number) {
  try {
    const { data } = await getPhotos(locationId)
    locationPhotos.value[locationId] = data
  } catch {
    ElMessage.error('加载照片失败')
  }
}

async function handleUpload(locationId: number, file: File) {
  try {
    await uploadPhoto(locationId, file)
    ElMessage.success('上传成功')
    loadPhotos(locationId)
  } catch {
    ElMessage.error('上传失败')
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

function viewerPrev() {
  if (viewerIndex.value > 0) viewerIndex.value--
}

function viewerNext() {
  if (viewerIndex.value < viewerPhotos.value.length - 1) viewerIndex.value++
}

function handleKeydown(e: KeyboardEvent) {
  if (!showPhotoViewer.value) return
  if (e.key === 'Escape') showPhotoViewer.value = false
  if (e.key === 'ArrowLeft') viewerPrev()
  if (e.key === 'ArrowRight') viewerNext()
}

function renderNote(note: string | null) {
  return note ? renderMarkdown(note) : ''
}

function goToEdit() {
  router.push(`/trips/${tripId}/edit`)
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
    await deleteTrip(tripId)
    ElMessage.success('删除成功')
    router.push('/trips')
  } catch {
    ElMessage.error('删除失败')
  }
}

async function handleShare() {
  try {
    const { data } = await createShare(tripId)
    const url = `${window.location.origin}/share/${data.token}`
    await navigator.clipboard.writeText(url)
    ElMessage.success('分享链接已复制到剪贴板')
  } catch {
    ElMessage.error('分享失败')
  }
}

async function handleExport(format: 'json' | 'markdown') {
  try {
    const resp = await request.get(`/trips/${tripId}/export/${format}`, { responseType: 'blob' })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = url
    a.download = format === 'json' ? 'trip.json' : 'trip.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('导出失败')
  }
  showExportDialog.value = false
}
</script>

<template>
  <div class="detail-page" @keydown="handleKeydown" tabindex="0">
    <div v-loading="loading">
      <div v-if="trip" class="detail-content">
        <!-- 返回按钮 -->
        <button class="back-btn" @click="router.push('/trips')">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回旅行列表</span>
        </button>

        <!-- 页面头部 -->
        <div class="detail-header">
          <div class="header-left">
            <h2 class="trip-title">{{ trip.title }}</h2>
            <div class="trip-meta">
              <span class="meta-date">{{ trip.start_date }} ~ {{ trip.end_date }}</span>
              <span v-if="trip.description" class="meta-desc">{{ trip.description }}</span>
            </div>
          </div>
          <div class="header-actions">
            <button class="action-btn primary" @click="goToEdit">
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </button>
            <button class="action-btn secondary" @click="showExportDialog = true">
              <el-icon><Download /></el-icon>
              <span>导出</span>
            </button>
            <button class="action-btn secondary" @click="handleShare">
              <el-icon><Share /></el-icon>
              <span>分享</span>
            </button>
            <button class="action-btn danger" @click="handleDelete">
              <el-icon><Delete /></el-icon>
              <span>删除</span>
            </button>
          </div>
        </div>

        <!-- 地点列表 -->
        <div class="locations-list">
          <div v-for="(loc, index) in trip.locations" :key="loc.id" class="location-card stagger-item" :style="{ animationDelay: `${index * 60}ms` }">
            <div class="location-header" @click="toggleLocation(loc)">
              <div class="location-info">
                <span class="location-index">{{ index + 1 }}</span>
                <div class="location-text">
                  <span class="location-name">{{ loc.name }}</span>
                  <span class="location-city">{{ loc.city }} · {{ loc.province }}</span>
                </div>
                <span v-if="loc.photo_count" class="photo-badge">{{ loc.photo_count }} 张照片</span>
              </div>
              <el-icon class="expand-icon" :class="{ expanded: expandedLocations.has(loc.id) }">
                <ArrowDown />
              </el-icon>
            </div>

            <transition name="expand">
              <div v-if="expandedLocations.has(loc.id)" class="location-body">
                <!-- 照片区域 -->
                <div class="photos-section">
                  <div class="section-label">照片</div>
                  <div class="photos-grid">
                    <div
                      v-for="(photo, pIndex) in (locationPhotos[loc.id] || [])"
                      :key="photo.id"
                      class="photo-item"
                      @click="openViewer(locationPhotos[loc.id] || [], pIndex)"
                    >
                      <img :src="photo.thumbnail_url" :alt="photo.file_name" />
                      <div class="photo-overlay">
                        <button class="photo-delete" @click.stop="handleDeletePhoto(photo.id, loc.id)">
                          <el-icon><Delete /></el-icon>
                        </button>
                      </div>
                    </div>
                    <!-- 上传按钮 -->
                    <el-upload
                      :show-file-list="false"
                      :before-upload="beforeUpload(loc.id)"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      class="upload-card"
                    >
                      <div class="upload-trigger">
                        <el-icon><Plus /></el-icon>
                        <span>上传照片</span>
                      </div>
                    </el-upload>
                  </div>
                </div>

                <!-- 游记区域 -->
                <div v-if="loc.note" class="note-section">
                  <div class="section-label">游记</div>
                  <div class="markdown-body" v-html="renderNote(loc.note)"></div>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>
    </div>

    <!-- Photo viewer -->
    <PhotoViewer
      :photos="viewerPhotos"
      :index="viewerIndex"
      :visible="showPhotoViewer"
      @close="showPhotoViewer = false"
      @update:index="viewerIndex = $event"
    />

    <!-- Export dialog -->
    <el-dialog v-model="showExportDialog" title="" width="360px">
      <div class="export-dialog">
        <div class="export-title">导出旅行</div>
        <div class="export-options">
          <button class="export-option" @click="handleExport('json')">
            <div class="export-option-icon">📄</div>
            <div class="export-option-info">
              <div class="export-option-name">导出为 JSON</div>
              <div class="export-option-desc">数据备份，可重新导入</div>
            </div>
          </button>
          <button class="export-option" @click="handleExport('markdown')">
            <div class="export-option-icon">📦</div>
            <div class="export-option-info">
              <div class="export-option-name">导出为 Markdown</div>
              <div class="export-option-desc">含照片的压缩包</div>
            </div>
          </button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.detail-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
  outline: none;
}

/* 返回按钮 */
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-warm-gray-500);
  font-family: var(--font-sans);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 16px;
}

.back-btn:hover {
  color: var(--color-warm-gray-900);
  background: var(--color-cream);
}

/* 头部 */
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
  gap: 16px;
  flex-wrap: wrap;
}

.trip-title {
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-warm-gray-900);
  margin-bottom: 8px;
}

.trip-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-date {
  font-size: 14px;
  color: var(--color-amber-dark);
  font-weight: 500;
}

.meta-desc {
  font-size: 15px;
  color: var(--color-warm-gray-700);
  line-height: 1.6;
}

/* 操作按钮 */
.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn.primary {
  background: var(--color-amber);
  color: white;
}

.action-btn.primary:hover {
  background: var(--color-amber-dark);
  transform: translateY(-1px);
  box-shadow: var(--shadow-warm);
}

.action-btn.secondary {
  background: var(--color-warm-white);
  color: var(--color-warm-gray-700);
  border: 1px solid var(--color-warm-gray-100);
}

.action-btn.secondary:hover {
  border-color: var(--color-amber-light);
  color: var(--color-amber-dark);
}

.action-btn.danger {
  background: var(--color-warm-white);
  color: var(--color-terracotta);
  border: 1px solid var(--color-warm-gray-100);
}

.action-btn.danger:hover {
  background: rgba(196, 112, 75, 0.08);
  border-color: var(--color-terracotta-light);
}

/* 地点卡片 */
.locations-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.location-card {
  background: var(--color-warm-white);
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all 0.3s ease;
}

.location-card:hover {
  box-shadow: var(--shadow-soft);
}

.location-header {
  padding: 14px 18px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background 0.2s ease;
}

.location-header:hover {
  background: var(--color-cream);
}

.location-info {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
}

.location-index {
  width: 32px;
  height: 32px;
  background: var(--color-amber);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.location-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.location-name {
  font-weight: 600;
  font-size: 16px;
  color: var(--color-warm-gray-900);
}

.location-city {
  font-size: 13px;
  color: var(--color-warm-gray-500);
}

.photo-badge {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-cream);
  color: var(--color-warm-gray-700);
  border: 1px solid var(--color-warm-gray-100);
  white-space: nowrap;
}

.expand-icon {
  color: var(--color-warm-gray-400);
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

/* 展开动画 */
.expand-enter-active {
  transition: all 0.3s ease-out;
}

.expand-leave-active {
  transition: all 0.2s ease-in;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
}

.location-body {
  padding: 18px;
  border-top: 1px solid var(--color-warm-gray-100);
}

/* 照片区域 */
.section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-warm-gray-400);
  margin-bottom: 12px;
}

.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.photo-item {
  position: relative;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 1;
  transition: transform 0.2s ease;
}

.photo-item:hover {
  transform: scale(1.03);
}

.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.photo-item:hover .photo-overlay {
  opacity: 1;
}

.photo-delete {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: var(--color-terracotta);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.photo-delete:hover {
  background: white;
  transform: scale(1.1);
}

/* 上传卡片 */
.upload-card {
  width: 100%;
}

.upload-trigger {
  aspect-ratio: 1;
  border: 2px dashed var(--color-warm-gray-200);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--color-warm-gray-400);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-trigger:hover {
  border-color: var(--color-amber);
  color: var(--color-amber-dark);
  background: rgba(212, 168, 83, 0.04);
}

.upload-trigger .el-icon {
  font-size: 20px;
}

/* 游记区域 */
.note-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-warm-gray-100);
}

/* 导出弹窗 */
.export-dialog {
  padding: 8px 0;
}

.export-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-warm-gray-900);
  margin-bottom: 20px;
}

.export-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.export-option {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--color-warm-gray-100);
  border-radius: var(--radius-md);
  background: var(--color-warm-white);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.export-option:hover {
  border-color: var(--color-amber-light);
  box-shadow: var(--shadow-soft);
}

.export-option-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.export-option-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-warm-gray-900);
}

.export-option-desc {
  font-size: 12px;
  color: var(--color-warm-gray-500);
  margin-top: 2px;
}

@media (max-width: 768px) {
  .detail-page {
    padding: 16px;
  }

  .trip-title {
    font-size: 22px;
  }

  .detail-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .action-btn {
    flex: 1;
    justify-content: center;
  }

  .photos-grid {
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  }
}
</style>
