<script setup lang="ts">
import { ref, onMounted, onUnmounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import AMapLoader from '@amap/amap-jsapi-loader'
import { ElMessage } from 'element-plus'
import { Camera } from '@element-plus/icons-vue'
import { getCityMarkers, getMapStats, getAllRoutes, getPhotoMarkers } from '../api/stats'
import { getConfig } from '../api/config'
import EmptyState from '../components/EmptyState.vue'
import PhotoViewer from '../components/PhotoViewer.vue'
import type { CityMarker, MapStats, TripRoute, PhotoMapMarker } from '../types'
import { acquireImageResource, type ImageResource } from '../utils/authenticatedImage'

const router = useRouter()
const stats = ref<MapStats>({ trip_count: 0, location_count: 0, city_count: 0, province_count: 0 })
const statsLoaded = ref(false)
const cityMarkers = ref<CityMarker[]>([])
const routes = ref<TripRoute[]>([])
const selectedTripId = ref<number | null>(null)
// PRD 4.5：移动端统计面板默认折叠，桌面端默认展开
const showStats = ref(window.innerWidth >= 768)
const map = shallowRef<any>(null)
let AMapRef: any = null
const mapOverlays: any[] = []
let scaleControl: any = null
let toolBarControl: any = null
let fitViewTimer: ReturnType<typeof setTimeout> | null = null
let disposed = false

// 高德地图官方样式列表
const mapStyles = [
  { value: 'normal', label: '标准' },
  { value: 'dark', label: '幻影黑' },
  { value: 'light', label: '月光银' },
  { value: 'whitesmoke', label: '远山黛' },
  { value: 'fresh', label: '草色青' },
  { value: 'grey', label: '雅士灰' },
  { value: 'graffiti', label: '涂鸦' },
  { value: 'macaron', label: '马卡龙' },
  { value: 'blue', label: '极夜蓝' },
  { value: 'darkblue', label: '靛青蓝' },
  { value: 'wine', label: '酱紫' },
]
const currentStyle = ref(localStorage.getItem('mapStyle') || 'normal')

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c))
}

// Layer toggles
const showSatellite = ref(false)
const showRoadNet = ref(false)
const showTraffic = ref(false)
let satelliteLayer: any = null
let roadNetLayer: any = null
let trafficLayer: any = null

// Photo mode
const photoMode = ref(false)
const photoMarkers = ref<PhotoMapMarker[]>([])
// PhotoViewer 只需要这四个字段；照片地图标记数据不含完整 Photo 元数据
interface ViewerPhoto {
  id: number
  original_url: string
  thumbnail_url: string
  file_name: string
}
const viewerPhotos = ref<ViewerPhoto[]>([])
const viewerIndex = ref(0)
const showViewer = ref(false)
const photoMarkerImageResources: ImageResource[] = []
let photoMarkerLoadController: AbortController | null = null
let photoModeRequestId = 0

// Lazy load routes
const routesLoaded = ref(false)

async function loadRoutes() {
  if (!routesLoaded.value) {
    try {
      const { data } = await getAllRoutes()
      routes.value = data
      routesLoaded.value = true
    } catch (error) {
      console.error('加载路线数据失败:', error)
      ElMessage.error('加载路线数据失败，请稍后重试')
    }
  }
}

onMounted(async () => {
  try {
    const [statsRes, citiesRes] = await Promise.all([
      getMapStats(),
      getCityMarkers(),
    ])
    stats.value = statsRes.data
    cityMarkers.value = citiesRes.data
    statsLoaded.value = true

    await initMap()
    renderCityMarkers()
  } catch (error) {
    console.error('加载数据失败:', error)
    ElMessage.error('加载地图数据失败，请刷新页面重试')
  }
})

async function initMap() {
  const config = await getConfig()
  if (!config.amap_key) {
    throw new Error('请填写 AMAP_KEY')
  }
  ;(window as any)._AMapSecurityConfig = { securityJsCode: config.amap_security_code }
  AMapRef = await AMapLoader.load({
    key: config.amap_key,
    version: '2.0',
    plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.TileLayer.Satellite', 'AMap.TileLayer.RoadNet', 'AMap.TileLayer.Traffic'],
  })

  if (disposed) return
  createMap()
}

function createMap(center?: [number, number], zoom?: number) {
  if (map.value) {
    clearFitViewTimer()
    clearOverlays()
    removeLayerInstances()
    map.value.destroy()
  }

  map.value = new AMapRef.Map('map-container', {
    zoom: zoom || 5,
    center: center || [104.065735, 30.659462],
    mapStyle: `amap://styles/${currentStyle.value}`,
  })

  scaleControl = new AMapRef.Scale()
  toolBarControl = new AMapRef.ToolBar()
  map.value.addControl(scaleControl)
  map.value.addControl(toolBarControl)
  restoreEnabledLayers()
}

async function onStyleChange(style: string) {
  if (!map.value || !AMapRef) {
    ElMessage.error('地图尚未初始化，请刷新页面重试')
    return
  }
  currentStyle.value = style
  localStorage.setItem('mapStyle', style)

  // 保存当前视角
  const center = map.value ? map.value.getCenter() : null
  const zoom = map.value ? map.value.getZoom() : undefined

  // 重建地图以应用新样式
  const centerArr: [number, number] | undefined = center ? [center.getLng(), center.getLat()] : undefined
  createMap(centerArr, zoom)

  // 重新绘制覆盖物
  if (photoMode.value) {
    await renderPhotoMarkers()
  } else if (selectedTripId.value) {
    const route = routes.value.find((r) => r.trip_id === selectedTripId.value)
    if (route) drawRoute(route)
  } else {
    renderCityMarkers()
  }
}

function onRouteChange(tripId: number | null | undefined) {
  selectTrip(tripId || null)
}

function toggleSatellite() {
  showSatellite.value = !showSatellite.value
  if (!map.value || !AMapRef) return
  if (showSatellite.value) {
    satelliteLayer = new AMapRef.TileLayer.Satellite()
    map.value.add(satelliteLayer)
  } else {
    if (satelliteLayer) map.value.remove(satelliteLayer)
    satelliteLayer = null
  }
}

function toggleRoadNet() {
  showRoadNet.value = !showRoadNet.value
  if (!map.value || !AMapRef) return
  if (showRoadNet.value) {
    roadNetLayer = new AMapRef.TileLayer.RoadNet()
    map.value.add(roadNetLayer)
  } else {
    if (roadNetLayer) map.value.remove(roadNetLayer)
    roadNetLayer = null
  }
}

function toggleTraffic() {
  showTraffic.value = !showTraffic.value
  if (!map.value || !AMapRef) return
  if (showTraffic.value) {
    trafficLayer = new AMapRef.TileLayer.Traffic()
    map.value.add(trafficLayer)
  } else {
    if (trafficLayer) map.value.remove(trafficLayer)
    trafficLayer = null
  }
}

function restoreEnabledLayers() {
  if (!map.value || !AMapRef) return
  if (showSatellite.value) {
    satelliteLayer = new AMapRef.TileLayer.Satellite()
    map.value.add(satelliteLayer)
  }
  if (showRoadNet.value) {
    roadNetLayer = new AMapRef.TileLayer.RoadNet()
    map.value.add(roadNetLayer)
  }
  if (showTraffic.value) {
    trafficLayer = new AMapRef.TileLayer.Traffic()
    map.value.add(trafficLayer)
  }
}

function removeLayerInstances() {
  if (map.value) {
    for (const layer of [satelliteLayer, roadNetLayer, trafficLayer]) {
      if (layer) {
        try { map.value.remove(layer) } catch {}
      }
    }
  }
  satelliteLayer = null
  roadNetLayer = null
  trafficLayer = null
}

function clearFitViewTimer() {
  if (fitViewTimer) {
    clearTimeout(fitViewTimer)
    fitViewTimer = null
  }
}

function clearOverlays() {
  photoMarkerLoadController?.abort()
  photoMarkerLoadController = null
  photoMarkerImageResources.splice(0).forEach((resource) => resource.release())
  if (!map.value) return
  mapOverlays.forEach((o) => {
    try { map.value.remove(o) } catch {}
  })
  mapOverlays.length = 0
}

function renderCityMarkers() {
  if (!map.value || !AMapRef) return

  cityMarkers.value.forEach((city) => {
    const size = Math.max(34, Math.min(city.city.length * 14 + 18, 80))
    const scale = Math.min(1 + (city.count - 1) * 0.09, 1.32)
    const badge = city.count > 1
      ? `<span style="position:absolute;top:-8px;right:-8px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:var(--color-accent);color:var(--color-on-accent);font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);">${city.count}</span>`
      : ''
    const marker = new AMapRef.Marker({
      position: [city.longitude, city.latitude],
      title: `${city.city} (${city.count}次)`,
      content: `<div style="position:relative;transform:scale(${scale});background:var(--color-primary);color:var(--color-on-primary);border:2px solid rgba(255,255,255,0.92);border-radius:10px;padding:0 12px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(12,18,15,0.3);white-space:nowrap;">${escapeHtml(city.city)}${badge}</div>`,
      offset: new AMapRef.Pixel(0, -size / 2),
    })

    marker.on('click', () => {
      router.push({ path: '/trips', query: { city: city.city } })
    })

    map.value.add(marker)
    mapOverlays.push(marker)
  })
}

function drawRoute(route: TripRoute) {
  if (!map.value || !AMapRef || route.locations.length < 2) return

  const path = route.locations.map((l) => new AMapRef.LngLat(l.longitude, l.latitude))

  // White outline underneath for contrast
  const outline = new AMapRef.Polyline({
    path,
    strokeColor: '#ffffff',
    strokeWeight: 8,
    strokeOpacity: 0.9,
    lineJoin: 'round',
    lineCap: 'round',
  })
  map.value.add(outline)
  mapOverlays.push(outline)

  // Colored route line on top
  const polyline = new AMapRef.Polyline({
    path,
    strokeColor: route.color,
    strokeWeight: 5,
    strokeStyle: 'solid',
    strokeOpacity: 1,
    lineJoin: 'round',
    lineCap: 'round',
    showDir: true,
  })
  map.value.add(polyline)
  mapOverlays.push(polyline)

  // Add location markers with labels for all points
  route.locations.forEach((loc, idx) => {
    const isFirst = idx === 0
    const isLast = idx === route.locations.length - 1
    const marker = new AMapRef.CircleMarker({
      center: new AMapRef.LngLat(loc.longitude, loc.latitude),
      radius: isFirst || isLast ? 8 : 6,
      strokeColor: '#fff',
      strokeWeight: isFirst || isLast ? 3 : 2,
      fillColor: isFirst ? '#1F5C46' : isLast ? '#C64B36' : route.color,
      fillOpacity: 1,
    })
    map.value.add(marker)
    mapOverlays.push(marker)

    // 所有点位都显示名称标签
    const bgColor = isFirst ? '#1F5C46' : isLast ? '#C64B36' : route.color
    const prefix = isFirst ? '起点' : isLast ? '终点' : `${idx + 1}`
    const label = new AMapRef.Marker({
      position: [loc.longitude, loc.latitude],
      content: `<div style="background: ${bgColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.3); font-weight: ${isFirst || isLast ? '600' : '400'};">${escapeHtml(prefix)}: ${escapeHtml(loc.name)}</div>`,
      offset: new AMapRef.Pixel(-30, -30),
    })
    map.value.add(label)
    mapOverlays.push(label)
  })
}

async function selectTrip(tripId: number | null) {
  selectedTripId.value = tripId
  if (!map.value) return

  clearOverlays()

  if (photoMode.value) {
    await renderPhotoMarkers()
    return
  }

  if (tripId) {
    await loadRoutes()
    const route = routes.value.find((r) => r.trip_id === tripId)
    if (route) {
      drawRoute(route)
      // 自适应当前绘制的覆盖物，让整条路线全部显示在屏幕中
      clearFitViewTimer()
      fitViewTimer = setTimeout(() => {
        fitViewTimer = null
        map.value?.setFitView(mapOverlays, false, [80, 80, 80, 80])
      }, 200)
    }
  } else {
    // 只显示城市标记，不显示路线
    renderCityMarkers()
    map.value.setCenter([104.065735, 30.659462])
    map.value.setZoom(5)
  }
}

async function togglePhotoMode() {
  const requestId = ++photoModeRequestId
  photoMode.value = !photoMode.value
  if (photoMode.value) {
    // Load photo markers if not loaded
    if (photoMarkers.value.length === 0) {
      try {
        const { data } = await getPhotoMarkers()
        if (requestId !== photoModeRequestId || !photoMode.value || disposed) return
        photoMarkers.value = data
      } catch {
        if (requestId !== photoModeRequestId || !photoMode.value || disposed) return
        ElMessage.error('加载照片数据失败')
        photoMode.value = false
        return
      }
    }
    if (requestId !== photoModeRequestId || !photoMode.value || disposed) return
    if (photoMarkers.value.length === 0) {
      ElMessage.info('还没有照片，先去上传一些吧')
      photoMode.value = false
      return
    }
    clearOverlays()
    await renderPhotoMarkers()
  } else {
    clearOverlays()
    if (selectedTripId.value) {
      const route = routes.value.find((r) => r.trip_id === selectedTripId.value)
      if (route) drawRoute(route)
    } else {
      renderCityMarkers()
    }
  }
}

async function renderPhotoMarkers() {
  if (!map.value || !AMapRef) return

  photoMarkerLoadController?.abort()
  photoMarkerImageResources.splice(0).forEach((resource) => resource.release())
  const controller = new AbortController()
  photoMarkerLoadController = controller
  const loadedMarkers = await Promise.all(photoMarkers.value.map(async (photoMarker) => {
    try {
      const resource = await acquireImageResource(photoMarker.thumbnail_url, controller.signal)
      return { photoMarker, resource }
    } catch {
      return { photoMarker, resource: null }
    }
  }))

  if (controller.signal.aborted || photoMarkerLoadController !== controller || disposed) {
    loadedMarkers.forEach(({ resource }) => resource?.release())
    return
  }
  photoMarkerLoadController = null

  let failedCount = 0
  loadedMarkers.forEach(({ photoMarker: pm, resource }) => {
    if (resource) photoMarkerImageResources.push(resource)
    else failedCount += 1
    const markerContent = resource
      ? `<img src="${escapeHtml(resource.src)}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
      : '<span role="img" aria-label="照片加载失败" style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;background:#e5ebe7;color:#59635e;font-size:11px;">失败</span>'
    const marker = new AMapRef.Marker({
      position: [pm.longitude, pm.latitude],
      content: `<div style="width:40px;height:40px;border:2px solid #fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">${markerContent}</div>`,
      offset: new AMapRef.Pixel(-20, -20),
    })
    marker.on('click', () => {
      viewerPhotos.value = photoMarkers.value.map((p) => ({
        id: p.photo_id,
        original_url: p.original_url,
        thumbnail_url: p.thumbnail_url,
        file_name: p.location_name,
      }))
      viewerIndex.value = photoMarkers.value.findIndex((p) => p.photo_id === pm.photo_id)
      showViewer.value = true
    })
    map.value.add(marker)
    mapOverlays.push(marker)
  })

  if (failedCount > 0) ElMessage.warning(`${failedCount} 张照片加载失败`)
}

function toggleStats() {
  showStats.value = !showStats.value
}

onUnmounted(() => {
  disposed = true
  clearFitViewTimer()
  clearOverlays()
  removeLayerInstances()
  map.value?.destroy()
  map.value = null
  scaleControl = null
  toolBarControl = null
  AMapRef = null
})
</script>

<template>
  <div class="map-page">
    <div id="map-container" class="map-container"></div>

    <!-- Unified control panel -->
    <div class="control-panel" :class="{ collapsed: !showStats }">
      <button class="panel-header" :aria-expanded="showStats" @click="toggleStats">
        <span class="panel-title">统计概览</span>
        <el-icon class="toggle-icon"><ArrowUp v-if="showStats" /><ArrowDown v-else /></el-icon>
      </button>

      <template v-if="showStats">
        <!-- Stats -->
        <div class="panel-stats">
          <div class="stat-item">
            <div class="stat-value">{{ stats.trip_count }}</div>
            <div class="stat-label">旅行</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ stats.location_count }}</div>
            <div class="stat-label">地点</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ stats.city_count }}</div>
            <div class="stat-label">城市</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ stats.province_count }}</div>
            <div class="stat-label">省份</div>
          </div>
        </div>

        <div class="panel-divider"></div>

        <!-- Map style -->
        <div class="panel-section">
          <div class="section-label">地图样式</div>
          <el-select v-model="currentStyle" @change="onStyleChange" size="small" style="width: 100%">
            <el-option v-for="s in mapStyles" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </div>

        <!-- Layer toggles -->
        <div class="panel-section">
          <div class="section-label">图层</div>
          <div class="layer-toggles">
            <button :class="['layer-btn', { active: showSatellite }]" @click="toggleSatellite">卫星</button>
            <button :class="['layer-btn', { active: showRoadNet }]" @click="toggleRoadNet">路网</button>
            <button :class="['layer-btn', { active: showTraffic }]" @click="toggleTraffic">路况</button>
          </div>
        </div>

        <!-- Route filter -->
        <div class="panel-section">
          <div class="section-label">路线筛选</div>
          <el-select v-model="selectedTripId" @change="onRouteChange" @focus="loadRoutes" size="small" clearable placeholder="查看路线" style="width: 100%">
            <el-option v-for="r in routes" :key="r.trip_id" :label="r.title" :value="r.trip_id" />
          </el-select>
        </div>

        <!-- Photo mode -->
        <div class="panel-section">
          <button :class="['photo-mode-btn', { active: photoMode }]" @click="togglePhotoMode">
            <el-icon><Camera /></el-icon>
            <span>{{ photoMode ? '退出照片模式' : '照片地图' }}</span>
          </button>
        </div>
      </template>
    </div>

    <!-- Empty state -->
    <div v-if="statsLoaded && stats.trip_count === 0" class="empty-overlay">
      <EmptyState
        icon="map"
        title="标记你的第一个旅行目的地"
        actionText="创建旅行"
        @action="router.push('/trips/new')"
      />
    </div>

    <PhotoViewer
      :photos="viewerPhotos"
      :index="viewerIndex"
      :visible="showViewer"
      @close="showViewer = false"
      @update:index="viewerIndex = $event"
    />
  </div>
</template>

<style scoped>
.map-page {
  position: relative;
  height: 100%;
}

.map-container {
  width: 100%;
  height: 100%;
}

/* 控制面板：玻璃浮层 */
.control-panel {
  position: absolute;
  top: 24px;
  left: 24px;
  width: 264px;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  backdrop-filter: blur(16px) saturate(1.1);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-elevated);
  z-index: 10;
  overflow: hidden;
  transition: width var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}

.control-panel.collapsed {
  width: auto;
  min-width: 156px;
}

.panel-header {
  width: 100%;
  min-height: 48px;
  padding: 12px 16px;
  border: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
  background: transparent;
  text-align: left;
  user-select: none;
  transition: background-color var(--dur-fast) ease;
}

.panel-header:hover {
  background: var(--color-primary-soft);
}

.toggle-icon {
  font-size: 12px;
  color: var(--color-ink-muted);
}

/* 统计格 */
.panel-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
  padding: 12px 8px 16px;
  border-top: 1px solid var(--color-border);
}

.stat-item {
  text-align: center;
  padding: 8px 4px;
}

.stat-value {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 11px;
  color: var(--color-ink-muted);
  margin-top: 2px;
  letter-spacing: 0.08em;
}

.panel-divider {
  height: 1px;
  background: var(--color-border);
  margin: 0 16px;
}

/* 分组 */
.panel-section {
  padding: 12px 16px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-ink-muted);
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}

/* 图层切换 */
.layer-toggles {
  display: flex;
  gap: 8px;
}

.layer-btn {
  flex: 1;
  min-height: 44px;
  padding: 6px 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--color-ink-secondary);
  cursor: pointer;
  text-align: center;
  transition: border-color var(--dur-fast) ease, background-color var(--dur-fast) ease, color var(--dur-fast) ease;
}

.layer-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.layer-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 500;
}

/* 照片模式 */
.photo-mode-btn {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink-secondary);
  cursor: pointer;
  transition: border-color var(--dur-fast) ease, background-color var(--dur-fast) ease, color var(--dur-fast) ease;
}

.photo-mode-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.photo-mode-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-on-primary);
}

.photo-mode-btn .el-icon {
  font-size: 17px;
}

/* 空状态 */
.empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-canvas) 82%, transparent);
  z-index: 5;
}

/* 响应式 */
@media (max-width: 768px) {
  .control-panel {
    top: 12px;
    left: 12px;
    right: 12px;
    width: auto;
    max-height: calc(100dvh - 180px);
    overflow-y: auto;
  }

  .control-panel.collapsed {
    min-width: 0;
  }

  .panel-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding: 10px 4px 12px;
  }

  .stat-value {
    font-size: 18px;
  }

  .panel-section {
    padding: 8px 12px;
  }
}
</style>
