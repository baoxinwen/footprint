<script setup lang="ts">
import { ref, onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import AMapLoader from '@amap/amap-jsapi-loader'
import { ElMessage } from 'element-plus'
import { getCityMarkers, getMapStats, getAllRoutes, getPhotoMarkers } from '../api/stats'
import { getConfig } from '../api/config'
import EmptyState from '../components/EmptyState.vue'
import PhotoViewer from '../components/PhotoViewer.vue'
import type { CityMarker, MapStats, TripRoute, PhotoMapMarker } from '../types'

const router = useRouter()
const stats = ref<MapStats>({ trip_count: 0, location_count: 0, city_count: 0, province_count: 0 })
const cityMarkers = ref<CityMarker[]>([])
const routes = ref<TripRoute[]>([])
const selectedTripId = ref<number | null>(null)
const showStats = ref(true)
const map = shallowRef<any>(null)
let AMapRef: any = null
const mapOverlays: any[] = []
let scaleControl: any = null
let toolBarControl: any = null

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
const viewerPhotos = ref<any[]>([])
const viewerIndex = ref(0)
const showViewer = ref(false)

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
  ;(window as any)._AMapSecurityConfig = { securityJsCode: '' }
  AMapRef = await AMapLoader.load({
    key: config.amap_key,
    version: '2.0',
    plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.TileLayer.Satellite', 'AMap.TileLayer.RoadNet', 'AMap.TileLayer.Traffic'],
  })

  createMap()
}

function createMap(center?: [number, number], zoom?: number) {
  if (map.value) {
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
}

function onStyleChange(style: string) {
  currentStyle.value = style
  localStorage.setItem('mapStyle', style)

  // 保存当前视角
  const center = map.value ? map.value.getCenter() : null
  const zoom = map.value ? map.value.getZoom() : undefined

  // 重建地图以应用新样式
  const centerArr: [number, number] | undefined = center ? [center.getLng(), center.getLat()] : undefined
  createMap(centerArr, zoom)

  // 重新绘制覆盖物
  clearOverlays()
  if (selectedTripId.value) {
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

function clearOverlays() {
  if (!map.value) return
  mapOverlays.forEach((o) => {
    try { map.value.remove(o) } catch {}
  })
  mapOverlays.length = 0
}

function renderCityMarkers() {
  if (!map.value || !AMapRef) return

  cityMarkers.value.forEach((city) => {
    const size = Math.max(32, Math.min(city.city.length * 14 + 16, 80))
    const marker = new AMapRef.Marker({
      position: [city.longitude, city.latitude],
      title: `${city.city} (${city.count}次)`,
      content: `<div style="background: #D4A853; color: white; border-radius: ${size}px; padding: 0 10px; height: ${size}px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); white-space: nowrap;">${escapeHtml(city.city)}</div>`,
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
      fillColor: isFirst ? '#4CAF50' : isLast ? '#F44336' : route.color,
      fillOpacity: 1,
    })
    map.value.add(marker)
    mapOverlays.push(marker)

    // 所有点位都显示名称标签
    const bgColor = isFirst ? '#4CAF50' : isLast ? '#F44336' : route.color
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
    renderPhotoMarkers()
    return
  }

  if (tripId) {
    await loadRoutes()
    const route = routes.value.find((r) => r.trip_id === tripId)
    if (route) {
      drawRoute(route)
      // 自适应当前绘制的覆盖物，让整条路线全部显示在屏幕中
      setTimeout(() => {
        map.value.setFitView(mapOverlays, false, [80, 80, 80, 80])
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
  photoMode.value = !photoMode.value
  if (photoMode.value) {
    // Load photo markers if not loaded
    if (photoMarkers.value.length === 0) {
      try {
        const { data } = await getPhotoMarkers()
        photoMarkers.value = data
      } catch {
        ElMessage.error('加载照片数据失败')
        photoMode.value = false
        return
      }
    }
    if (photoMarkers.value.length === 0) {
      ElMessage.info('还没有照片，先去上传一些吧')
      photoMode.value = false
      return
    }
    clearOverlays()
    renderPhotoMarkers()
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

function renderPhotoMarkers() {
  if (!map.value || !AMapRef) return
  photoMarkers.value.forEach((pm) => {
    const marker = new AMapRef.Marker({
      position: [pm.longitude, pm.latitude],
      content: `<div style="width:40px;height:40px;border:2px solid #fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;"><img src="${escapeHtml(pm.thumbnail_url)}" style="width:100%;height:100%;object-fit:cover;" /></div>`,
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
}

function toggleStats() {
  showStats.value = !showStats.value
}
</script>

<template>
  <div class="map-page">
    <div id="map-container" class="map-container"></div>

    <!-- Unified control panel -->
    <div class="control-panel" :class="{ collapsed: !showStats }">
      <div class="panel-header" @click="toggleStats">
        <span class="panel-title">统计概览</span>
        <span class="toggle-icon">{{ showStats ? '▲' : '▼' }}</span>
      </div>

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
            <span>📸</span>
            <span>{{ photoMode ? '退出照片模式' : '照片地图' }}</span>
          </button>
        </div>
      </template>
    </div>

    <!-- Empty state -->
    <div v-if="stats.trip_count === 0" class="empty-overlay">
      <EmptyState
        icon="🗺"
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

/* Unified Control Panel */
.control-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 200px;
  background: rgba(254, 252, 249, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 14px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.05);
  z-index: 10;
  border: 1px solid rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: all 0.3s ease;
}

.control-panel.collapsed {
  width: auto;
  min-width: 140px;
}

.panel-header {
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 14px;
  color: #2C2C2C;
  background: rgba(212, 168, 83, 0.06);
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  user-select: none;
}

.panel-header:hover {
  background: rgba(212, 168, 83, 0.1);
}

.toggle-icon {
  font-size: 10px;
  color: #8A8279;
  transition: transform 0.2s;
}

/* Stats Grid */
.panel-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 14px 16px;
}

.stat-item {
  text-align: center;
  padding: 6px 0;
  border-radius: 8px;
  background: rgba(212, 168, 83, 0.04);
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #D4A853;
  font-family: 'Noto Serif SC', serif;
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: #8A8279;
  margin-top: 2px;
}

/* Divider */
.panel-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: 0 16px;
}

/* Sections */
.panel-section {
  padding: 10px 16px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: #8A8279;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Layer Toggles */
.layer-toggles {
  display: flex;
  gap: 4px;
}

.layer-btn {
  flex: 1;
  padding: 6px 0;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  background: transparent;
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 12px;
  color: #5C5650;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.layer-btn:hover {
  border-color: rgba(212, 168, 83, 0.3);
  background: rgba(212, 168, 83, 0.06);
}

.layer-btn.active {
  background: #D4A853;
  border-color: #D4A853;
  color: white;
  font-weight: 500;
}

/* Photo Mode Button */
.photo-mode-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 0;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: transparent;
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #5C5650;
  cursor: pointer;
  transition: all 0.2s ease;
}

.photo-mode-btn:hover {
  border-color: rgba(212, 168, 83, 0.3);
  background: rgba(212, 168, 83, 0.06);
}

.photo-mode-btn.active {
  background: linear-gradient(135deg, #D4A853 0%, #C49A4A 100%);
  border-color: transparent;
  color: white;
  box-shadow: 0 2px 8px rgba(212, 168, 83, 0.3);
}

/* Empty State */
.empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(253, 248, 240, 0.85);
  z-index: 5;
}

/* Responsive */
@media (max-width: 768px) {
  .control-panel {
    top: 10px;
    left: 10px;
    right: 10px;
    width: auto;
    border-radius: 12px;
  }

  .control-panel.collapsed {
    min-width: auto;
  }

  .panel-stats {
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    padding: 10px 12px;
  }

  .stat-item {
    padding: 4px 0;
  }

  .stat-value {
    font-size: 18px;
  }

  .panel-section {
    padding: 8px 12px;
  }
}
</style>
