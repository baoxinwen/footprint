<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { viewShare } from '../api/shares'
import { getPhotos } from '../api/photos'
import type { TripDetail, Photo } from '../types'
import { renderMarkdown } from '../utils/markdown'
import PhotoViewer from '../components/PhotoViewer.vue'

const route = useRoute()
const router = useRouter()
const token = route.params.token as string
const trip = ref<TripDetail | null>(null)
const loading = ref(true)
const error = ref('')
const expandedLocations = ref<Set<number>>(new Set())
const locationPhotos = ref<Record<number, Photo[]>>({})
const showPhotoViewer = ref(false)
const viewerPhotos = ref<Photo[]>([])
const viewerIndex = ref(0)

onMounted(async () => {
  try {
    const { data } = await viewShare(token)
    trip.value = data
  } catch (err: any) {
    if (err.response?.status === 410) {
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
  try {
    const { data } = await getPhotos(locationId)
    locationPhotos.value[locationId] = data
  } catch {
    console.error('加载照片失败')
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
</script>

<template>
  <div class="share-page">
    <div v-if="loading" v-loading="true" style="height: 200px;"></div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="trip" class="share-content">
      <div class="share-header">
        <h2>{{ trip.title }}</h2>
        <span class="share-date">{{ trip.start_date }} ~ {{ trip.end_date }}</span>
        <p v-if="trip.description">{{ trip.description }}</p>
      </div>

      <div class="locations-list">
        <div v-for="(loc, index) in trip.locations" :key="loc.id" class="location-card">
          <div class="location-header" @click="toggleLocation(loc.id)">
            <div class="location-info">
              <span class="location-index">{{ index + 1 }}</span>
              <span class="location-name">{{ loc.name }}</span>
              <span class="location-city">{{ loc.city }} · {{ loc.province }}</span>
            </div>
            <el-icon>
              <ArrowDown v-if="!expandedLocations.has(loc.id)" />
              <ArrowUp v-else />
            </el-icon>
          </div>

          <div v-if="expandedLocations.has(loc.id)" class="location-body">
            <div v-if="locationPhotos[loc.id]?.length" class="photos-grid">
              <div
                v-for="(photo, pIndex) in locationPhotos[loc.id]"
                :key="photo.id"
                class="photo-item"
                @click="openViewer(locationPhotos[loc.id], pIndex)"
              >
                <img :src="photo.thumbnail_url" :alt="photo.file_name" />
              </div>
            </div>

            <div v-if="loc.note" class="note-section markdown-body" v-html="renderNote(loc.note)"></div>
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
  </div>
</template>

<style scoped>
.share-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.error-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--el-text-color-secondary);
}

.share-header {
  margin-bottom: 24px;
}

.share-header h2 {
  margin-bottom: 8px;
}

.share-date {
  color: var(--el-text-color-secondary);
}

.share-header p {
  margin-top: 8px;
  color: var(--el-text-color-regular);
}

.location-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}

.location-header {
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--el-fill-color-lighter);
}

.location-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.location-index {
  width: 28px;
  height: 28px;
  background: var(--el-color-primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
}

.location-name {
  font-weight: bold;
  font-size: 16px;
}

.location-city {
  color: var(--el-text-color-secondary);
}

.location-body {
  padding: 16px;
}

.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.photo-item {
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 1;
}

.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.note-section {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 16px;
}

</style>
