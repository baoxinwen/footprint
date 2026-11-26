<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { createTrip, getTrip, updateTrip } from '../api/trips'
import { uploadPhoto, getPhotos } from '../api/photos'
import type { Location, Photo, AmapPoi } from '../types'
import { ElMessage, ElMessageBox } from 'element-plus'
import AMapLoader from '@amap/amap-jsapi-loader'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { useTheme } from '../composables/useTheme'
import { isLogoutNavigation } from '../utils/authSession'
import { getConfig } from '../api/config'
import { discardLegacyTripDraft, getTripDraftKey } from '../utils/tripDraft'
import AuthenticatedImage from '../components/AuthenticatedImage.vue'
import { scrollToSection } from '../utils/dom'
import { durationDays as calcDurationDays } from '../utils/format'
import { clearPrivateCaches } from '../utils/pwa'
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

// Markdown 编辑器：内嵌在每个地点卡片内（声明需早于下方 watch 的监听源求值）
const editingNoteId = ref<number | null>(null)
const noteContent = ref('')
const notePreview = ref(true)

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

// 游记编辑器是否带未保存修改：收起/切换/保存/离开都要看它（评审 I-11~13）
function noteDirty(): boolean {
  if (editingNoteId.value === null) return false
  const target = locations.value.find((l) => l.id === editingNoteId.value)
  return !!target && noteContent.value !== (target.note || '')
}

watch([form, trackedLocations, noteContent], () => {
  if (!trackChanges) return
  hasUnsavedChanges.value = true
  if (!isEdit.value) scheduleDraftWrite()
}, { deep: true })

onBeforeUnmount(() => {
  // 卸载时若有未落盘的草稿变更，立即写入一次，避免丢草稿。
  // 护栏与定时器回调一致：保存成功/编辑模式不写，
  // 防止"复活"刚随保存成功删除的草稿（幽灵草稿）
  let timerFlushed = false
  if (draftSaveTimer !== null) {
    clearTimeout(draftSaveTimer)
    draftSaveTimer = null
    timerFlushed = true
  }
  // 新建模式下把编辑器缓冲区一并写进草稿：页面正在销毁，没有「取消」语义（评审 I-11）
  if ((timerFlushed || noteDirty()) && hasUnsavedChanges.value && !isEdit.value) {
    const editing = locations.value.find((l) => l.id === editingNoteId.value)
    if (editing && !editing._deleted) editing.note = noteContent.value
    writeDraftNow()
  }
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

window.addEventListener('beforeunload', handleBeforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

onBeforeUnmount(destroyPreviewMap)

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

// 编辑数据是否加载失败：失败时进入失败态，禁用整张表单并提供重试（评审 I-14）
const loadFailed = ref(false)
const loadErrorMessage = ref('')

async function initMapSdk() {
  // 加载高德地图 SDK（地点搜索使用 JS API Key，而非 Web 服务 Key）
  try {
    const config = await getConfig()
    ;(window as any)._AMapSecurityConfig = { securityJsCode: config.amap_security_code }
    if (!config.amap_key) {
      // 配置缺失刷新解决不了，给出可行动的指引（评审 M-20，与地图页一致）
      ElMessage.error('未配置高德地图 AMAP_KEY，请在服务端 .env 中配置后重启')
      return
    }
    AMapInstance = await AMapLoader.load({
      key: config.amap_key,
      version: '2.0',
      plugins: ['AMap.PlaceSearch', 'AMap.Geocoder'],
    })
    placeSearchInstance = new AMapInstance.PlaceSearch({ pageSize: 10, pageIndex: 1 })
    geocoderInstance = new AMapInstance.Geocoder()
  } catch {
    ElMessage.error('高德地图 SDK 加载失败，请检查网络后重试')
  }
}

async function loadTripForEdit() {
  loading.value = true
  loadFailed.value = false
  try {
    const { data } = await getTrip(tripId.value)
    form.value = {
      title: data.title,
      description: data.description || '',
      start_date: data.start_date,
      end_date: data.end_date,
    }
    locations.value = data.locations.map((l) => ({ ...l, photos: [], _deleted: false }))
  } catch (error: unknown) {
    // 进入失败态而不是留下一张可编辑的空表单（评审 I-14）；
    // 404（不存在/不属于当前用户）单独提示
    loadFailed.value = true
    const status = (error as { response?: { status?: number } })?.response?.status
    loadErrorMessage.value =
      status === 404 ? '旅行不存在或已被删除' : '加载旅行详情失败，请检查网络后重新加载'
  } finally {
    loading.value = false
    await nextTick()
    hasUnsavedChanges.value = false
    trackChanges = true
  }
}

onMounted(async () => {
  // 旅行数据与地图 SDK 并行加载（评审 I-15）：编辑页能否出数据
  // 不应依赖第三方 CDN 的快慢
  const sdkReady = initMapSdk()
  if (isEdit.value) await loadTripForEdit()
  await sdkReady
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
        ElMessage.warning(`未找到与「${poiSearch.value.trim()}」相关的地点，换个关键词试试`)
        return
      }
      const resolved = await resolveCityForPois(pois)
      if (seq !== poiSearchSeq) return // 逆地理编码等待期间可能有新搜索
      poiResults.value = resolved
      return
    }

    poiResults.value = []
    if (status === 'no_data') {
      ElMessage.warning(`未找到与「${poiSearch.value.trim()}」相关的地点，换个关键词试试`)
      return
    }

    const info = typeof result === 'string' ? result : result?.info || '未知错误'
    if (info === 'INVALID_USER_SCODE') {
      ElMessage.error('高德安全密钥未配置或无效，请在服务端 .env 中配置 AMAP_SECURITY_CODE 后重启')
    } else {
      ElMessage.error(`地图搜索失败（高德返回 ${info}），请检查 Key 与安全密钥配置`)
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

// ---- POI 选中预览（PRD 5.2）：点击结果先看落点，确认再添加，拦截错误匹配 ----
const pendingPoi = ref<AmapPoi | null>(null)
const previewMapEl = ref<HTMLDivElement | null>(null)
let previewMapInstance: { destroy: () => void; add: (overlay: unknown) => void } | null = null

function destroyPreviewMap() {
  previewMapInstance?.destroy()
  previewMapInstance = null
}

async function selectPoi(poi: AmapPoi) {
  // SDK 没就绪时画不了预览：退回旧行为直接添加，功能不因预览不可用
  if (!AMapInstance) {
    addPoi(poi)
    return
  }
  pendingPoi.value = poi
  await nextTick()
  if (!previewMapEl.value) return
  destroyPreviewMap()
  const center: [number, number] = [poi.location.lng, poi.location.lat]
  const map = new AMapInstance.Map(previewMapEl.value, { center, zoom: 15 })
  map.add(new AMapInstance.Marker({ position: center }))
  previewMapInstance = map
}

function confirmPendingPoi() {
  const poi = pendingPoi.value
  if (!poi) return
  pendingPoi.value = null
  destroyPreviewMap()
  addPoi(poi)
}

function cancelPendingPoi() {
  pendingPoi.value = null
  destroyPreviewMap()
}

async function removeLocation(loc: EditableLocation) {
  // 破坏性操作需确认：删除地点会连带丢弃其游记（保存后不可恢复）。
  // 确认放在关闭编辑器之前——用户取消时编辑态原样保留（评审 I-13）
  try {
    await ElMessageBox.confirm(
      `移除「${loc.name}」？其游记将一并删除${isEdit.value ? '，保存后生效' : ''}。`,
      '移除地点',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  if (editingNoteId.value === loc.id) closeNoteEditor()
  if (isEdit.value && loc.id && typeof loc.id === 'number' && loc.id > 0) {
    // Mark for deletion, don't actually delete yet
    loc._deleted = true
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
    ElMessage.success('已上传')
  } catch {
    ElMessage.error('上传照片失败，请稍后重试')
  }
  return false
}

async function startEditNote(loc: EditableLocation) {
  if (editingNoteId.value === loc.id) {
    // 同一地点再点一次＝收起：带未保存修改时先确认（评审 I-13）
    if (noteDirty()) {
      try {
        await ElMessageBox.confirm(
          `「${loc.name}」的游记尚未保存，收起后将丢失这些修改。`,
          '未保存的游记',
          { confirmButtonText: '放弃并收起', cancelButtonText: '继续编辑', type: 'warning' },
        )
      } catch {
        return
      }
    }
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
  // 打开编辑器时拉取该地点已上传照片，供「点击插入游记」（PRD 5.3/七）
  void loadEditorPhotos(loc)
}

// ---- 游记插入照片（PRD 5.3/七）：手写 /api/photos/{id}/… 的数字 id 不可用 ----
const editorPhotos = ref<Photo[]>([])

async function loadEditorPhotos(loc: EditableLocation) {
  editorPhotos.value = []
  // 新建模式的地点还没有 id，照片只能创建后在详情页上传
  if (!isEdit.value || typeof loc.id !== 'number' || loc.id <= 0) return
  try {
    const { data } = await getPhotos(loc.id)
    editorPhotos.value = data
  } catch {
    // 拉不到就不显示插入条，不影响游记编辑本身
  }
}

function insertPhotoSnippet(photo: Photo) {
  const snippet = `![${photo.file_name || '照片'}](${photo.original_url})`
  noteContent.value = noteContent.value
    ? `${noteContent.value.replace(/\s*$/, '')}\n\n${snippet}\n`
    : `${snippet}\n`
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
  editorPhotos.value = []
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
    // 正在编辑的游记一并提交（评审 I-12）：编辑器缓冲区先落回目标地点，
    // 不关编辑器——保存失败时输入还在原地
    const editing = locations.value.find((l) => l.id === editingNoteId.value)
    if (editing && !editing._deleted) editing.note = noteContent.value

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

      ElMessage.success('已保存')
      hasUnsavedChanges.value = false
      // 编辑保存可能连带删掉地点与照片：离线缓存里对应的旧快照与缩略图一并清掉
      void clearPrivateCaches()
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
      ElMessage.success('已创建')
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
      ElMessage.error('保存失败，请稍后重试')
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="form-page" v-loading="loading">
    <!-- 编辑数据加载失败：禁用整张表单，给出重试（评审 I-14） -->
    <section v-if="isEdit && loadFailed" class="load-failed-panel" role="alert">
      <h2 class="load-failed-title">无法加载旅行</h2>
      <p class="load-failed-desc">{{ loadErrorMessage }}</p>
      <div class="load-failed-actions">
        <el-button type="primary" @click="loadTripForEdit">重新加载</el-button>
        <el-button @click="router.push('/trips')">返回旅行列表</el-button>
      </div>
    </section>

    <template v-else>
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
            <el-input
              v-model="poiSearch"
              placeholder="搜索景点名称（如故宫、长城）"
              aria-label="搜索地点"
              @keyup.enter="searchPoi"
            >
              <template #append>
                <el-button aria-label="搜索地点" @click="searchPoi">搜索</el-button>
              </template>
            </el-input>

            <div v-if="poiResults.length" class="poi-results">
              <button v-for="poi in poiResults" :key="poi.name + '|' + poi.address + '|' + poi.location.lng + ',' + poi.location.lat" type="button" class="poi-item" @click="selectPoi(poi)">
                <div class="poi-name">{{ poi.name }}</div>
                <div class="poi-address">{{ poi.address }}</div>
              </button>
            </div>

            <!-- POI 选中预览：确认落点再添加，拦截同名不同城的错误匹配（PRD 5.2） -->
            <div v-if="pendingPoi" class="poi-preview" role="dialog" aria-label="确认添加地点">
              <div ref="previewMapEl" class="poi-preview-map" aria-hidden="true"></div>
              <p class="poi-preview-name">{{ pendingPoi.name }}</p>
              <div class="poi-preview-actions">
                <el-button size="small" @click="cancelPendingPoi">取消</el-button>
                <el-button size="small" type="primary" @click="confirmPendingPoi">添加</el-button>
              </div>
            </div>
          </div>

          <div class="locations-list">
            <div v-if="locations.filter(l => !l._deleted).length === 0" class="locations-empty">
              <p class="empty-title">尚未添加地点</p>
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
                <!-- 从已上传照片中选择插入（PRD 5.3/七）：替代手写数字 id 的不可用方式 -->
                <div v-if="editorPhotos.length" class="editor-photo-strip" role="listbox" aria-label="从已上传照片中选择插入游记">
                  <button
                    v-for="photo in editorPhotos"
                    :key="photo.id"
                    type="button"
                    role="option"
                    class="editor-photo-chip"
                    :title="`插入照片：${photo.file_name}`"
                    :aria-label="`插入照片：${photo.file_name}`"
                    @click="insertPhotoSnippet(photo)"
                  >
                    <AuthenticatedImage :src="photo.thumbnail_url" :alt="photo.file_name || '已上传照片'" />
                  </button>
                </div>
                <div class="editor-foot">
                  <div class="editor-actions">
                    <el-button size="small" @click="closeNoteEditor">取消</el-button>
                    <el-button size="small" type="primary" @click="saveNote">保存游记</el-button>
                  </div>
                </div>
              </div>

              <!-- 游记预览 -->
              <NoteMarkdown v-else-if="loc.note" class="note-preview" :note="loc.note" />
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
    </template>
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
  font-weight: var(--fw-semibold);
  letter-spacing: 0.22em;
  color: var(--color-accent);
  margin-bottom: var(--space-sm);
}

.form-title {
  font-size: var(--text-2xl);
  line-height: var(--lh-2xl);
  font-weight: var(--fw-bold);
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
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
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
  font-weight: var(--fw-bold);
}

.section-title {
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  font-weight: var(--fw-bold);
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
  overscroll-behavior: contain;
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
  transition: background-color var(--dur-fast) var(--ease-out);
}

.poi-item:last-child {
  border-bottom: 0;
}

.poi-item:hover {
  background: var(--color-primary-soft);
}

.poi-name {
  font-size: var(--text-sm);
  font-weight: var(--fw-medium);
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
  font-weight: var(--fw-semibold);
  color: var(--color-ink);
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
  font-weight: var(--fw-bold);
  flex-shrink: 0;
}

.location-info {
  flex: 1;
  min-width: 0;
}

.location-name {
  font-family: var(--font-serif);
  font-size: var(--text-base);
  font-weight: var(--fw-semibold);
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
  font-weight: var(--fw-semibold);
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

/* 从已上传照片选择插入（PRD 5.3/七） */
.editor-photo-strip {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow-x: auto;
}

.editor-photo-chip {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--color-field);
  transition: transform var(--dur-fast) var(--ease-out);
}

.editor-photo-chip:hover {
  transform: translateY(-1px);
}

.editor-photo-chip :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* POI 选中预览（PRD 5.2）：地图即说明，名称叠在地图上 */
.poi-preview {
  margin-top: var(--space-sm);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.poi-preview-map {
  position: relative;
  height: 200px;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.poi-preview-name {
  margin-top: var(--space-sm);
  font-weight: var(--fw-semibold);
  color: var(--color-ink);
}

.poi-preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
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
    /* 底部预留：吸底提交栏约 64 + 呼吸 32（标签栏的 64 由 main 自己的 padding-bottom 让出） */
    padding: var(--space-lg) var(--space-md) calc(96px + env(safe-area-inset-bottom));
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

  /* 提交栏吸底：与底部标签栏同为 fixed，固定在标签栏上方，长表单不必滚到底才能提交。
     不用 sticky——各内核对滚动容器 padding 的吸底参照不一致，Safari 上可能藏到标签栏后 */
  .form-actions {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(64px + env(safe-area-inset-bottom));
    z-index: 90;
    margin: 0;
    padding: var(--space-sm) var(--space-md) var(--space-md);
    background: color-mix(in srgb, var(--color-canvas) 92%, transparent);
    backdrop-filter: blur(14px);
    border-top: 1px solid var(--color-border);
  }

  .form-actions :deep(.el-button) {
    margin-left: 0; /* EP 相邻按钮自带的 12px 外边距，改由 gap 统一控制 */
  }

  .form-actions :deep(.el-button--primary) {
    flex: 1;
  }
}
</style>
