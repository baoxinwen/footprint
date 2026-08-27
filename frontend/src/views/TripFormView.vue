<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { createTrip, getTrip, updateTrip } from '../api/trips'
import { uploadPhoto } from '../api/photos'
import type { Location, Photo, AmapPoi } from '../types'
import { ElMessage, ElMessageBox } from 'element-plus'
import AMapLoader from '@amap/amap-jsapi-loader'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { useTheme } from '../composables/useTheme'
import { renderMarkdown } from '../utils/markdown'
import { isLogoutNavigation } from '../utils/authSession'
import { getConfig } from '../api/config'
import { discardLegacyTripDraft, getTripDraftKey } from '../utils/tripDraft'
import AuthenticatedImage from '../components/AuthenticatedImage.vue'
import { scrollToSection } from '../utils/dom'
import { durationDays as calcDurationDays } from '../utils/format'
import { Delete } from '@element-plus/icons-vue'

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

type EditableLocation = Location & { photos?: Photo[]; _deleted?: boolean }

const locations = ref<EditableLocation[]>([])
const loading = ref(false)
const saving = ref(false)
const hasUnsavedChanges = ref(false)
discardLegacyTripDraft()
const DRAFT_KEY = getTripDraftKey()
let trackChanges = !isEdit.value
let tempIdCounter = 0

const trackedLocations = computed(() => locations.value.map((location) => ({
  id: location.id,
  name: location.name,
  address: location.address,
  longitude: location.longitude,
  latitude: location.latitude,
  city: location.city,
  province: location.province,
  note: location.note,
  sort_order: location.sort_order,
  _deleted: location._deleted,
})))

function restoreDraft() {
  const rawDraft = localStorage.getItem(DRAFT_KEY)
  if (!rawDraft) return
  try {
    const draft = JSON.parse(rawDraft)
    if (!draft?.form || !Array.isArray(draft.locations)) throw new Error('invalid draft')
    const fields = ['title', 'description', 'start_date', 'end_date'] as const
    if (fields.some((field) => typeof draft.form[field] !== 'string')) throw new Error('invalid draft')
    form.value = { ...draft.form }
    locations.value = draft.locations
    tempIdCounter = locations.value.reduce((lowestId, location) => (
      typeof location.id === 'number' && location.id < lowestId ? location.id : lowestId
    ), 0)
    hasUnsavedChanges.value = true
  } catch {
    localStorage.removeItem(DRAFT_KEY)
  }
}

if (!isEdit.value) restoreDraft()

// 草稿写入：300ms 防抖 + 剔除照片元数据（体积大且可由服务端恢复），
// 并捕获配额溢出异常，避免每个键击全量序列化导致卡顿或未处理异常
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null

function writeDraftNow() {
  if (isEdit.value) return
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      form: form.value,
      locations: locations.value.map(({ photos: _photos, ...rest }) => rest),
    }))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      ElMessage.warning('浏览器存储空间不足，本次修改可能无法自动保存为草稿')
    }
  }
}

function scheduleDraftWrite() {
  if (draftSaveTimer !== null) clearTimeout(draftSaveTimer)
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null
    if (!hasUnsavedChanges.value || isEdit.value) return
    writeDraftNow()
  }, 300)
}

watch([form, trackedLocations], () => {
  if (!trackChanges) return
  hasUnsavedChanges.value = true
  if (!isEdit.value) scheduleDraftWrite()
}, { deep: true })

onBeforeUnmount(() => {
  // 卸载时若有未落盘的草稿变更，立即写入一次，避免丢草稿。
  // 护栏与定时器回调一致：保存成功/编辑模式不写，
  // 防止"复活"刚随保存成功删除的草稿（幽灵草稿）
  if (draftSaveTimer !== null) {
    clearTimeout(draftSaveTimer)
    draftSaveTimer = null
    if (hasUnsavedChanges.value && !isEdit.value) writeDraftNow()
  }
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

window.addEventListener('beforeunload', handleBeforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

onBeforeRouteLeave(async (to) => {
  if (isLogoutNavigation()) return true
  if (to.path === '/login' && !localStorage.getItem('token')) return true
  if (!hasUnsavedChanges.value) return true
  try {
    await ElMessageBox.confirm('当前修改尚未保存，确定离开吗？', '未保存的修改', {
      confirmButtonText: '离开',
      cancelButtonText: '继续编辑',
      type: 'warning',
    })
    return true
  } catch {
    return false
  }
})

// POI search
const poiSearch = ref('')
const poiResults = ref<AmapPoi[]>([])
let AMapInstance: any = null
let placeSearchInstance: any = null
let geocoderInstance: any = null

const municipalityNames = new Map([
  ['北京', '北京'],
  ['北京市', '北京'],
  ['上海', '上海'],
  ['上海市', '上海'],
  ['天津', '天津'],
  ['天津市', '天津'],
  ['重庆', '重庆'],
  ['重庆市', '重庆'],
])

function amapText(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = amapText(item)
      if (text) return text
    }
    return ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePoiMetadata(poi: any, addressComponent?: any): AmapPoi {
  const rawCity = amapText(addressComponent?.city) || amapText(poi.cityname)
  const rawProvince = amapText(addressComponent?.province) || amapText(poi.pname)
  const municipality = municipalityNames.get(rawProvince) || municipalityNames.get(rawCity)

  return {
    name: amapText(poi.name),
    address: amapText(poi.address),
    location: { lng: poi.location.lng, lat: poi.location.lat },
    cityname: municipality || rawCity,
    pname: municipality || rawProvince,
  }
}

// Markdown 编辑器：内嵌在每个地点卡片内
const editingNoteId = ref<number | null>(null)
const noteContent = ref('')
const notePreview = ref(true)

onMounted(async () => {
  // 加载高德地图 SDK（地点搜索使用 JS API Key，而非 Web 服务 Key）
  try {
    const config = await getConfig()
    ;(window as any)._AMapSecurityConfig = { securityJsCode: config.amap_security_code }
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
      await nextTick()
      hasUnsavedChanges.value = false
      trackChanges = true
    }
  }
})

function resolveCityForPois(pois: any[]): Promise<AmapPoi[]> {
  if (!geocoderInstance || pois.length === 0) {
    return Promise.resolve(pois.map((poi: any) => normalizePoiMetadata(poi)))
  }

  return new Promise((resolve) => {
    let done = 0
    const results: AmapPoi[] = new Array(pois.length)

    pois.forEach((poi: any, i: number) => {
      try {
        geocoderInstance.getAddress(poi.location, (_geoStatus: string, geoResult: any) => {
          const addrComp = geoResult?.regeocode?.addressComponent || {}
          results[i] = normalizePoiMetadata(poi, addrComp)
          done++
          if (done === pois.length) resolve(results)
        })
      } catch {
        // 单个 POI 逆编码失败时保留原始元数据，保证 Promise 必定 resolve
        results[i] = normalizePoiMetadata(poi)
        done++
        if (done === pois.length) resolve(results)
      }
    })
  })
}

// POI 搜索请求序号：高德 SDK 回调无法中止，用序号丢弃过期响应，
// 防止慢的旧结果覆盖新关键字的搜索结果
let poiSearchSeq = 0

function searchPoi() {
  if (!poiSearch.value.trim()) return
  if (!placeSearchInstance) {
    ElMessage.error('地图 SDK 未加载，请刷新页面重试')
    return
  }

  const seq = ++poiSearchSeq
  placeSearchInstance.search(poiSearch.value, async (status: string, result: any) => {
    if (seq !== poiSearchSeq) return // 已有更新的搜索，丢弃本次结果
    if (status === 'complete') {
      const pois = result?.poiList?.pois || result?.pois || []
      if (pois.length === 0) {
        poiResults.value = []
        ElMessage.warning('未找到相关地点')
        return
      }
      const resolved = await resolveCityForPois(pois)
      if (seq !== poiSearchSeq) return // 逆地理编码等待期间可能有新搜索
      poiResults.value = resolved
      return
    }

    poiResults.value = []
    if (status === 'no_data') {
      ElMessage.warning('未找到相关地点')
      return
    }

    const info = typeof result === 'string' ? result : result?.info || '未知错误'
    if (info === 'INVALID_USER_SCODE') {
      ElMessage.error('高德安全密钥未配置或无效，请在 .env 中填写 AMAP_SECURITY_CODE 后重启服务')
    } else {
      ElMessage.error(`地图搜索失败：${info}`)
    }
  })
}

function addPoi(poi: AmapPoi) {
  const normalizedPoi = normalizePoiMetadata(poi)
  const newLocation: EditableLocation = {
    id: --tempIdCounter, // 负数 ID 仅在前端临时使用，保存时才持久化
    name: normalizedPoi.name,
    address: normalizedPoi.address,
    longitude: normalizedPoi.location.lng,
    latitude: normalizedPoi.location.lat,
    city: normalizedPoi.cityname,
    province: normalizedPoi.pname,
    note: null,
    sort_order: locations.value.length,
    photo_count: 0,
    photos: [],
    _deleted: false,
  }

  locations.value.push(newLocation)
  poiResults.value = []
  poiSearch.value = ''
  const missingFields = [
    !newLocation.address && '地址',
    !newLocation.city && '城市',
    !newLocation.province && '省份',
  ].filter(Boolean)
  if (missingFields.length > 0) {
    const statisticsNotice = !newLocation.city ? '；缺少城市的信息不会计入城市统计' : ''
    ElMessage.warning(
      `已添加 ${newLocation.name}，但高德未返回${missingFields.join('、')}。可删除后重新搜索${statisticsNotice}`,
    )
  } else {
    ElMessage.success(`已添加 ${newLocation.name}`)
  }
}

function removeLocation(loc: EditableLocation) {
  if (editingNoteId.value === loc.id) editingNoteId.value = null
  if (isEdit.value && loc.id && typeof loc.id === 'number' && loc.id > 0) {
    // Mark for deletion, don't actually delete yet
    loc._deleted = true
    ElMessage.info('地点将在保存后删除')
  } else {
    const index = locations.value.indexOf(loc)
    if (index >= 0) locations.value.splice(index, 1)
  }
}

async function handleUploadPhoto(loc: EditableLocation, file: File) {
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

async function startEditNote(loc: EditableLocation) {
  if (editingNoteId.value === loc.id) {
    closeNoteEditor()
    return
  }
  // 切换目标时，未保存的修改先确认，避免静默丢失
  const editing = locations.value.find((l) => l.id === editingNoteId.value)
  if (editing && noteContent.value !== (editing.note || '')) {
    try {
      await ElMessageBox.confirm(
        `「${editing.name}」的游记尚未保存，切换后将丢失这些修改。`,
        '未保存的游记',
        { confirmButtonText: '放弃并切换', cancelButtonText: '继续编辑', type: 'warning' },
      )
    } catch {
      return
    }
  }
  editingNoteId.value = loc.id
  noteContent.value = loc.note || ''
  // 移动端默认单栏编辑；桌面默认双栏编辑+预览
  notePreview.value = window.innerWidth >= 900
}

function saveNote() {
  const target = locations.value.find((l) => l.id === editingNoteId.value)
  if (target && !target._deleted) {
    target.note = noteContent.value
  }
  closeNoteEditor()
}

function closeNoteEditor() {
  editingNoteId.value = null
  noteContent.value = ''
}

function renderNote(note: string | null) {
  return note ? renderMarkdown(note) : ''
}

function formatLocationRegion(location: EditableLocation) {
  const regions = Array.from(new Set([location.city, location.province].filter(Boolean)))
  return regions.join(' · ') || '地区信息缺失'
}

async function handleSave() {
  if (!form.value.title || !form.value.start_date || !form.value.end_date) {
    ElMessage.warning('请填写标题、开始日期和结束日期')
    return
  }
  if (calcDurationDays(form.value.start_date, form.value.end_date) === null) {
    ElMessage.warning('结束日期须大于等于开始日期')
    return
  }

  saving.value = true
  try {
    if (isEdit.value) {
      await updateTrip(tripId.value, {
        title: form.value.title,
        description: form.value.description,
        start_date: form.value.start_date,
        end_date: form.value.end_date,
        locations: locations.value
          .filter((location) => !location._deleted)
          .map((location) => ({
            ...(location.id > 0 ? { id: location.id } : {}),
            name: location.name,
            address: location.address,
            longitude: location.longitude,
            latitude: location.latitude,
            city: location.city,
            province: location.province,
            note: location.note,
          })),
        removed_location_ids: locations.value
          .filter((location) => location._deleted && typeof location.id === 'number' && location.id > 0)
          .map((location) => location.id),
      })

      ElMessage.success('保存成功')
      hasUnsavedChanges.value = false
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
      hasUnsavedChanges.value = false
      localStorage.removeItem(DRAFT_KEY)
      router.push(`/trips/${data.id}`)
    }
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 409) {
      // 数据冲突保护：另一窗口已修改此旅行，拒绝覆盖。
      // 不自动刷新地点列表，避免覆盖用户尚未保存的修改；由用户手动刷新。
      ElMessage.error('检测到其他窗口的修改，本页数据已过期。请复制未提交的内容后刷新页面重试')
    } else {
      ElMessage.error('保存失败')
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="form-page" v-loading="loading">
    <header class="form-header">
      <p class="form-kicker">行程档案</p>
      <h1 class="form-title">{{ isEdit ? '编辑旅行' : '新建旅行' }}</h1>
      <p class="form-desc">{{ isEdit ? '修改行程信息、地点、照片与游记' : '填写行程信息，搜索添加沿途地点' }}</p>
    </header>

    <div class="form-layout">
      <!-- 桌面侧栏节导航 -->
      <aside class="section-rail" aria-label="表单节导航">
        <button type="button" @click="scrollToSection('trip-info')">行程信息</button>
        <button type="button" @click="scrollToSection('location-list')">地点列表</button>
      </aside>

      <div class="form-content">
        <section id="trip-info" class="form-section" aria-labelledby="trip-info-title">
          <div class="section-heading">
            <span class="section-number">01</span>
            <h2 id="trip-info-title" class="section-title">行程信息</h2>
          </div>
          <el-form label-position="top" class="trip-form">
            <el-form-item label="标题" required>
              <el-input v-model="form.title" placeholder="旅行标题" />
            </el-form-item>

            <el-form-item label="描述">
              <el-input v-model="form.description" type="textarea" :rows="2" placeholder="旅行简述" />
            </el-form-item>

            <el-row :gutter="16">
              <el-col :span="12" class="date-column">
                <el-form-item label="开始日期" required>
                  <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12" class="date-column">
                <el-form-item label="结束日期" required>
                  <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </section>

        <section id="location-list" class="location-section form-section" aria-labelledby="location-list-title">
          <div class="section-heading">
            <span class="section-number">02</span>
            <h2 id="location-list-title" class="section-title">地点列表</h2>
          </div>

          <div class="poi-search">
            <el-input v-model="poiSearch" placeholder="搜索景点名称（如故宫、长城）" @keyup.enter="searchPoi">
              <template #append>
                <el-button @click="searchPoi">搜索</el-button>
              </template>
            </el-input>

            <div v-if="poiResults.length" class="poi-results">
              <button v-for="poi in poiResults" :key="poi.name" type="button" class="poi-item" @click="addPoi(poi)">
                <div class="poi-name">{{ poi.name }}</div>
                <div class="poi-address">{{ poi.address }}</div>
              </button>
            </div>
          </div>

          <div class="locations-list">
            <div v-if="locations.filter(l => !l._deleted).length === 0" class="locations-empty">
              <p class="empty-title">尚未添加地点</p>
              <p class="empty-hint">在上方搜索景点名称（如故宫、西湖），点击结果即可加入行程</p>
            </div>
            <div v-for="(loc, index) in locations.filter(l => !l._deleted)" :key="loc.id" class="location-item">
              <div class="location-main">
                <span class="location-index">{{ index + 1 }}</span>
                <div class="location-info">
                  <div class="location-name">{{ loc.name }}</div>
                  <div class="location-address">{{ formatLocationRegion(loc) }}</div>
                </div>
                <div class="location-actions">
                  <el-button size="small" @click="startEditNote(loc)">
                    {{ editingNoteId === loc.id ? '收起游记' : '游记' }}
                  </el-button>
                  <el-upload
                    :show-file-list="false"
                    :before-upload="(file: File) => handleUploadPhoto(loc, file)"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                  >
                    <el-button size="small">照片</el-button>
                  </el-upload>
                  <el-button
                    size="small"
                    type="danger"
                    plain
                    :aria-label="`删除地点：${loc.name}`"
                    @click="removeLocation(loc)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>

              <!-- 照片预览 -->
              <div v-if="loc.photos && loc.photos.length" class="location-photos">
                <AuthenticatedImage
                  v-for="photo in loc.photos"
                  :key="photo.id"
                  :src="photo.thumbnail_url"
                  :alt="photo.file_name || `${loc.name}的照片`"
                  class="photo-thumb"
                />
              </div>

              <!-- 内嵌游记编辑器：桌面双栏编辑/预览 -->
              <div v-if="editingNoteId === loc.id" class="note-editor-area">
                <div class="editor-toolbar">
                  <span class="editor-title">{{ loc.name }} · 游记</span>
                  <div class="editor-tabs" role="tablist" aria-label="游记编辑视图">
                    <button
                      type="button"
                      role="tab"
                      :aria-selected="notePreview === false"
                      :class="['tab-btn', { active: notePreview === false }]"
                      @click="notePreview = false"
                    >编辑</button>
                    <button
                      type="button"
                      role="tab"
                      :aria-selected="notePreview === true"
                      :class="['tab-btn', { active: notePreview === true }]"
                      @click="notePreview = true"
                    >预览</button>
                  </div>
                </div>
                <MdEditor
                  v-model="noteContent"
                  :theme="isDark ? 'dark' : 'light'"
                  language="zh-CN"
                  :preview="notePreview"
                  :toolbars="['bold', 'italic', 'strikeThrough', '-', 'image', 'link', '-', 'preview']"
                  style="height: 360px"
                />
                <div class="editor-foot">
                  <span class="editor-hint">支持 Markdown 语法；图片可用「照片」按钮上传后，在游记中以链接引用</span>
                  <div class="editor-actions">
                    <el-button size="small" @click="closeNoteEditor">取消</el-button>
                    <el-button size="small" type="primary" @click="saveNote">保存游记</el-button>
                  </div>
                </div>
              </div>

              <!-- 游记预览 -->
              <div v-else-if="loc.note" class="note-preview markdown-body" v-html="renderNote(loc.note)"></div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <footer class="form-actions">
      <el-button @click="router.back()">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">
        {{ isEdit ? '保存修改' : '创建旅行' }}
      </el-button>
    </footer>
  </div>
</template>

<style scoped>
.form-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--space-2xl) clamp(16px, 3vw, 40px) var(--space-3xl);
}

/* ========== 页头 ========== */
.form-header {
  padding-bottom: var(--space-lg);
  margin-bottom: var(--space-xl);
  border-bottom: 1px solid var(--color-border);
}

.form-kicker {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.22em;
  color: var(--color-accent);
  margin-bottom: var(--space-sm);
}

.form-title {
  font-size: var(--text-2xl);
  line-height: var(--lh-2xl);
  font-weight: 700;
}

.form-desc {
  margin-top: var(--space-sm);
  font-size: var(--text-base);
  color: var(--color-ink-secondary);
}

/* ========== 布局：侧栏 + 内容 ========== */
.form-layout {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  gap: var(--space-2xl);
  align-items: start;
}

.section-rail {
  position: sticky;
  top: 88px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-rail button {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border: 0;
  border-left: 2px solid var(--color-border);
  border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
  background: transparent;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease, background-color var(--dur-fast) ease;
}

.section-rail button:hover {
  color: var(--color-ink);
  border-left-color: var(--color-ink-muted);
  background: var(--color-surface-muted);
}

/* ========== 分节 ========== */
.form-section {
  margin-bottom: var(--space-2xl);
}

.section-heading {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.section-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1.5px solid var(--color-primary);
  color: var(--color-primary);
  font-family: var(--font-serif);
  font-size: var(--text-sm);
  font-weight: 700;
}

.section-title {
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  font-weight: 700;
}

.trip-form {
  max-width: 640px;
}

/* ========== POI 搜索 ========== */
.poi-search {
  position: relative;
  margin-bottom: var(--space-lg);
}

.poi-results {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: 320px;
  overflow-y: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-elevated);
}

.poi-item {
  display: block;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dur-fast) ease;
}

.poi-item:last-child {
  border-bottom: 0;
}

.poi-item:hover {
  background: var(--color-primary-soft);
}

.poi-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink);
}

.poi-address {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  margin-top: 2px;
}

/* ========== 地点列表 ========== */
.locations-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.locations-empty {
  padding: var(--space-2xl) var(--space-lg);
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  text-align: center;
}

.empty-title {
  font-family: var(--font-serif);
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--color-ink);
}

.empty-hint {
  margin-top: 6px;
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
}

.location-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}

.location-main {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
}

.location-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1.5px solid var(--color-primary);
  color: var(--color-primary);
  font-family: var(--font-serif);
  font-size: var(--text-sm);
  font-weight: 700;
  flex-shrink: 0;
}

.location-info {
  flex: 1;
  min-width: 0;
}

.location-name {
  font-family: var(--font-serif);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-ink);
}

.location-address {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
  margin-top: 2px;
}

.location-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
}

/* 照片预览 */
.location-photos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  padding: 0 var(--space-lg) var(--space-md);
}

.photo-thumb {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-xs);
  overflow: hidden;
  object-fit: cover;
  display: block;
}

.photo-thumb :deep(img),
.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 内嵌编辑器 */
.note-editor-area {
  border-top: 1px solid var(--color-border);
  padding: var(--space-md) var(--space-lg) var(--space-lg);
  background: var(--color-surface);
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-sm);
}

.editor-title {
  font-family: var(--font-serif);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
}

.editor-tabs {
  display: none;
  gap: 4px;
}

.tab-btn {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink-muted);
  font-size: var(--text-xs);
  cursor: pointer;
}

.tab-btn.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.editor-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-top: var(--space-sm);
  flex-wrap: wrap;
}

.editor-hint {
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
}

.editor-actions {
  display: flex;
  gap: var(--space-sm);
}

/* 游记预览 */
.note-preview {
  padding: 0 var(--space-lg) var(--space-md);
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
}

/* ========== 底部操作条 ========== */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border);
}

/* ========== 响应式 ========== */
@media (max-width: 900px) {
  .form-layout {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .section-rail {
    display: none;
  }

  /* 移动端显示编辑/预览切换（notePreview 已按视口默认单栏编辑） */
  .editor-tabs {
    display: flex;
  }
}

@media (max-width: 768px) {
  .form-page {
    padding: var(--space-lg) var(--space-md) var(--space-2xl);
  }

  .form-title {
    font-size: var(--text-xl);
    line-height: var(--lh-xl);
  }

  .location-main {
    flex-wrap: wrap;
  }

  .location-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
