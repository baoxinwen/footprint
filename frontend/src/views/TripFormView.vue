<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createTrip, getTrip, updateTrip, addLocation, updateLocation, deleteLocation } from '../api/trips'
import { uploadPhoto } from '../api/photos'
import type { Location, Photo, AmapPoi } from '../types'
import { ElMessage } from 'element-plus'
import AMapLoader from '@amap/amap-jsapi-loader'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { useTheme } from '../composables/useTheme'
import { renderMarkdown } from '../utils/markdown'
import { getConfig } from '../api/config'

const route = useRoute()
const router = useRouter()
const { isDark } = useTheme()
const isEdit = computed(() => !!route.params.id)
const tripId = computed(() => Number(route.params.id))

const form = ref({
  title: '',
  description: '',
  start_date: '',
  end_date: '',
})

const locations = ref<(Location & { photos?: Photo[]; _deleted?: boolean })[]>([])
const loading = ref(false)
const saving = ref(false)

// POI search
const poiSearch = ref('')
const poiResults = ref<AmapPoi[]>([])
let AMapInstance: any = null
let placeSearchInstance: any = null
let geocoderInstance: any = null

// Markdown editor
const showNoteEditor = ref(false)
const editingNoteLocationIndex = ref<number>(0)
const noteContent = ref('')
let tempIdCounter = 0

onMounted(async () => {
  // 加载高德地图 SDK
  try {
    const config = await getConfig()
    ;(window as any)._AMapSecurityConfig = { securityJsCode: '' }
    AMapInstance = await AMapLoader.load({
      key: config.amap_key,
      version: '2.0',
      plugins: ['AMap.PlaceSearch', 'AMap.Geocoder'],
    })
    placeSearchInstance = new AMapInstance.PlaceSearch({ pageSize: 10, pageIndex: 1 })
    geocoderInstance = new AMapInstance.Geocoder()
  } catch {
    ElMessage.error('高德地图 SDK 加载失败')
  }

  if (isEdit.value) {
    loading.value = true
    try {
      const { data } = await getTrip(tripId.value)
      form.value = {
        title: data.title,
        description: data.description || '',
        start_date: data.start_date,
        end_date: data.end_date,
      }
      locations.value = data.locations.map((l) => ({ ...l, photos: [], _deleted: false }))
    } catch {
      ElMessage.error('加载失败')
    } finally {
      loading.value = false
    }
  }
})

function resolveCityForPois(pois: any[]): Promise<AmapPoi[]> {
  if (!geocoderInstance || pois.length === 0) {
    return Promise.resolve(pois.map((poi: any) => ({
      name: poi.name,
      address: poi.address || '',
      location: { lng: poi.location.lng, lat: poi.location.lat },
      cityname: '',
      pname: '',
    })))
  }

  return new Promise((resolve) => {
    let done = 0
    const results: AmapPoi[] = new Array(pois.length)

    pois.forEach((poi: any, i: number) => {
      geocoderInstance.getAddress(poi.location, (_geoStatus: string, geoResult: any) => {
        const addrComp = geoResult?.regeocode?.addressComponent || {}
        results[i] = {
          name: poi.name,
          address: poi.address || '',
          location: { lng: poi.location.lng, lat: poi.location.lat },
          cityname: addrComp.city || '',
          pname: addrComp.province || '',
        }
        done++
        if (done === pois.length) resolve(results)
      })
    })
  })
}

function searchPoi() {
  if (!poiSearch.value.trim()) return
  if (!placeSearchInstance) {
    ElMessage.error('地图 SDK 未加载，请刷新页面重试')
    return
  }
  placeSearchInstance.search(poiSearch.value, async (status: string, result: any) => {
    if (status === 'complete') {
      const pois = result?.poiList?.pois || result?.pois || []
      if (pois.length === 0) {
        ElMessage.warning('未找到相关地点')
        return
      }
      poiResults.value = await resolveCityForPois(pois)
    } else {
      poiResults.value = []
      ElMessage.warning('未找到相关地点')
    }
  })
}

async function addPoi(poi: AmapPoi) {
  const newLocation: any = {
    name: poi.name,
    address: poi.address,
    longitude: poi.location.lng,
    latitude: poi.location.lat,
    city: poi.cityname,
    province: poi.pname,
    note: null,
    photo_count: 0,
    photos: [],
    _deleted: false,
  }

  if (isEdit.value) {
    try {
      const { data } = await addLocation(tripId.value, {
        name: poi.name,
        address: poi.address,
        longitude: poi.location.lng,
        latitude: poi.location.lat,
        city: poi.cityname,
        province: poi.pname,
      })
      newLocation.id = data.id
      newLocation.sort_order = data.sort_order
    } catch {
      return
    }
  } else {
    newLocation.id = --tempIdCounter // negative IDs for temp
    newLocation.sort_order = locations.value.length
  }

  locations.value.push(newLocation)
  poiResults.value = []
  poiSearch.value = ''
  ElMessage.success(`已添加 ${poi.name}`)
}

async function removeLocation(index: number) {
  const loc = locations.value[index]
  if (isEdit.value && loc.id && typeof loc.id === 'number' && loc.id > 0) {
    // Mark for deletion, don't actually delete yet
    loc._deleted = true
    ElMessage.info('地点将在保存后删除')
  } else {
    locations.value.splice(index, 1)
  }
}

async function handleUploadPhoto(locationIndex: number, file: File) {
  const loc = locations.value[locationIndex]
  if (!loc.id || typeof loc.id !== 'number' || loc.id < 0) {
    ElMessage.warning('请先保存旅行后再上传照片')
    return false
  }

  try {
    const { data } = await uploadPhoto(loc.id, file)
    if (!loc.photos) loc.photos = []
    loc.photos.push(data)
    loc.photo_count = (loc.photo_count || 0) + 1
    ElMessage.success('上传成功')
  } catch {
    ElMessage.error('上传失败')
  }
  return false
}

function startEditNote(locationIndex: number) {
  editingNoteLocationIndex.value = locationIndex
  noteContent.value = locations.value[locationIndex].note || ''
  showNoteEditor.value = true
}

function saveNote() {
  locations.value[editingNoteLocationIndex.value].note = noteContent.value
  showNoteEditor.value = false
  noteContent.value = ''
}

function closeNoteEditor() {
  showNoteEditor.value = false
  noteContent.value = ''
}

function renderNote(note: string | null) {
  return note ? renderMarkdown(note) : ''
}

async function handleSave() {
  if (!form.value.title || !form.value.start_date || !form.value.end_date) {
    ElMessage.warning('请填写标题、开始日期和结束日期')
    return
  }

  saving.value = true
  try {
    if (isEdit.value) {
      // Update trip info
      await updateTrip(tripId.value, {
        title: form.value.title,
        description: form.value.description,
        start_date: form.value.start_date,
        end_date: form.value.end_date,
      })

      // Delete marked locations
      for (const loc of locations.value) {
        if (loc._deleted && loc.id) {
          await deleteLocation(tripId.value, loc.id)
        }
      }

      // Update existing locations' notes
      for (const loc of locations.value) {
        if (!loc._deleted && loc.id && typeof loc.id === 'number' && loc.id > 0) {
          await updateLocation(tripId.value, loc.id, {
            name: loc.name,
            address: loc.address,
            longitude: loc.longitude,
            latitude: loc.latitude,
            city: loc.city,
            province: loc.province,
            note: loc.note,
          })
        }
      }

      ElMessage.success('保存成功')
      router.push(`/trips/${tripId.value}`)
    } else {
      const validLocations = locations.value.filter((l) => !l._deleted)
      const { data } = await createTrip({
        title: form.value.title,
        description: form.value.description,
        start_date: form.value.start_date,
        end_date: form.value.end_date,
        locations: validLocations.map((l) => ({
          name: l.name,
          address: l.address,
          longitude: l.longitude,
          latitude: l.latitude,
          city: l.city,
          province: l.province,
          note: l.note,
        })),
      })
      ElMessage.success('创建成功')
      router.push(`/trips/${data.id}`)
    }
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="form-page" v-loading="loading">
    <h2>{{ isEdit ? '编辑旅行' : '新建旅行' }}</h2>

    <el-form label-position="top" class="trip-form">
      <el-form-item label="标题" required>
        <el-input v-model="form.title" placeholder="旅行标题" />
      </el-form-item>

      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="旅行简述" />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="开始日期" required>
            <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="结束日期" required>
            <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <!-- Location search -->
    <div class="location-section">
      <h3>地点列表</h3>
      <div class="poi-search">
        <el-input v-model="poiSearch" placeholder="搜索景点名称（如故宫、长城）" @keyup.enter="searchPoi">
          <template #append>
            <el-button @click="searchPoi">搜索</el-button>
          </template>
        </el-input>

        <div v-if="poiResults.length" class="poi-results">
          <div v-for="poi in poiResults" :key="poi.name" class="poi-item" @click="addPoi(poi)">
            <div class="poi-name">{{ poi.name }}</div>
            <div class="poi-address">{{ poi.address }}</div>
          </div>
        </div>
      </div>

      <div class="locations-list">
        <div v-for="(loc, index) in locations.filter(l => !l._deleted)" :key="loc.id" class="location-item">
          <div class="location-main">
            <span class="location-index">{{ index + 1 }}</span>
            <div class="location-info">
              <div class="location-name">{{ loc.name }}</div>
              <div class="location-address">{{ loc.city }} · {{ loc.province }}</div>
            </div>
            <div class="location-actions">
              <el-button size="small" @click="startEditNote(index)">游记</el-button>
              <el-upload
                :show-file-list="false"
                :before-upload="(file: File) => handleUploadPhoto(index, file)"
                accept="image/jpeg,image/png,image/gif,image/webp"
              >
                <el-button size="small">照片</el-button>
              </el-upload>
              <el-button size="small" type="danger" @click="removeLocation(index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>

          <!-- Photos preview -->
          <div v-if="loc.photos && loc.photos.length" class="location-photos">
            <img v-for="photo in loc.photos" :key="photo.id" :src="photo.thumbnail_url" class="photo-thumb" />
          </div>

          <!-- Note preview -->
          <div v-if="loc.note" class="note-preview markdown-body" v-html="renderNote(loc.note)"></div>
        </div>
      </div>
    </div>

    <div class="form-actions">
      <el-button @click="router.back()">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">
        {{ isEdit ? '保存' : '创建' }}
      </el-button>
    </div>

    <!-- Note editor dialog -->
    <el-dialog v-model="showNoteEditor" title="" width="90%" top="3vh" @close="closeNoteEditor">
      <MdEditor
        v-model="noteContent"
        :theme="isDark ? 'dark' : 'light'"
        language="zh-CN"
        :preview="true"
        style="height: 65vh"
      />
      <template #footer>
        <el-button @click="closeNoteEditor">取消</el-button>
        <el-button type="primary" @click="saveNote">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.form-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.trip-form {
  margin-bottom: 32px;
}

.location-section h3 {
  margin-bottom: 12px;
}

.poi-search {
  margin-bottom: 16px;
}

.poi-results {
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  margin-top: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.poi-item {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.poi-item:hover {
  background: var(--el-fill-color-light);
}

.poi-name {
  font-weight: bold;
  font-size: 14px;
}

.poi-address {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.location-item {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.location-main {
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
  flex-shrink: 0;
}

.location-info {
  flex: 1;
}

.location-name {
  font-weight: bold;
}

.location-address {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.location-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.location-photos {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.photo-thumb {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}

.note-preview {
  margin-top: 8px;
  padding: 8px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  max-height: 100px;
  overflow-y: auto;
}

.form-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
