<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Close } from '@element-plus/icons-vue'
import AuthenticatedImage from './AuthenticatedImage.vue'

interface Photo {
  id: number
  original_url: string
  thumbnail_url: string
  file_name: string
}

const props = defineProps<{
  photos: Photo[]
  index: number
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  'update:index': [value: number]
}>()

const canPrev = computed(() => props.index > 0)
const canNext = computed(() => props.index < props.photos.length - 1)
const viewerRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
let previouslyFocusedElement: HTMLElement | null = null

function prev() { if (canPrev.value) emit('update:index', props.index - 1) }
function next() { if (canNext.value) emit('update:index', props.index + 1) }

function trapTabFocus(e: KeyboardEvent) {
  const controls = Array.from(
    viewerRef.value?.querySelectorAll<HTMLElement>('.viewer-close, .viewer-prev, .viewer-next') ?? [],
  ).filter(control => !control.matches(':disabled, [aria-disabled="true"]'))

  e.preventDefault()
  if (controls.length === 0) return

  const currentIndex = controls.indexOf(document.activeElement as HTMLElement)
  if (currentIndex === -1) {
    controls[e.shiftKey ? controls.length - 1 : 0].focus()
    return
  }

  const offset = e.shiftKey ? -1 : 1
  controls[(currentIndex + offset + controls.length) % controls.length].focus()
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.visible) return
  if (e.key === 'Tab') {
    trapTabFocus(e)
    return
  }
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft' && props.index > 0) emit('update:index', props.index - 1)
  if (e.key === 'ArrowRight' && props.index < props.photos.length - 1) emit('update:index', props.index + 1)
}

// 触摸手势（PRD 6.2 移动端：左右滑切换、下滑关闭）。
// 事件挂在查看器容器上并使用 passive 监听，不阻止滚动默认行为之外的任何交互。
const SWIPE_HORIZONTAL_THRESHOLD = 50
const SWIPE_DOWN_THRESHOLD = 80
const SWIPE_VERTICAL_RATIO = 1.5
let trackedTouchId: number | null = null
let touchStartX = 0
let touchStartY = 0

function handleTouchStart(e: TouchEvent) {
  // 已在追踪某根手指时忽略后续落指，避免双指捏合/第二根手指覆写起点
  if (trackedTouchId !== null) return
  const touch = e.changedTouches[0]
  if (!touch) return
  trackedTouchId = touch.identifier
  touchStartX = touch.clientX
  touchStartY = touch.clientY
}

function handleTouchEnd(e: TouchEvent) {
  // 只结算最初追踪的那根手指；仍有手指按住时不结算（防双指误判）
  let touch: Touch | undefined
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === trackedTouchId) {
      touch = e.changedTouches[i]
      break
    }
  }
  trackedTouchId = null
  if (!touch || !props.visible || e.touches.length > 0) return

  const dx = touch.clientX - touchStartX
  const dy = touch.clientY - touchStartY

  // 下滑关闭：垂直位移明显大于水平位移时才判定，避免误伤左右滑动
  if (dy > SWIPE_DOWN_THRESHOLD && Math.abs(dy) > Math.abs(dx) * SWIPE_VERTICAL_RATIO) {
    emit('close')
    return
  }

  if (Math.abs(dx) < SWIPE_HORIZONTAL_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return
  if (dx < 0) {
    next()   // 向左滑 → 下一张
  } else {
    prev()   // 向右滑 → 上一张
  }
}

function focusCloseButton() {
  nextTick(() => {
    const target = closeButtonRef.value
    const element = target instanceof HTMLElement ? target : target?.$el
    element?.focus()
  })
}

function rememberFocusAndOpen() {
  previouslyFocusedElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
  focusCloseButton()
}

function restoreFocus() {
  if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus()
  previouslyFocusedElement = null
}

watch(() => props.visible, (visible, wasVisible) => {
  if (visible && !wasVisible) rememberFocusAndOpen()
  if (!visible && wasVisible) restoreFocus()
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  if (props.visible) rememberFocusAndOpen()
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  restoreFocus()
})
</script>

<template>
  <div
    v-if="visible"
    ref="viewerRef"
    class="photo-viewer"
    role="dialog"
    aria-modal="true"
    aria-label="照片查看器"
    @click.self="emit('close')"
    @touchstart.passive="handleTouchStart"
    @touchend.passive="handleTouchEnd"
  >
    <el-button ref="closeButtonRef" class="viewer-close" circle aria-label="关闭照片查看器" @click="emit('close')">
      <el-icon><Close /></el-icon>
    </el-button>
    <el-button class="viewer-prev" circle aria-label="上一张照片" @click="prev" :disabled="!canPrev">
      <el-icon><ArrowLeft /></el-icon>
    </el-button>
    <div class="viewer-content">
      <AuthenticatedImage
        :src="photos[index]?.original_url"
        :alt="photos[index]?.file_name || `照片 ${index + 1}`"
      />
    </div>
    <el-button class="viewer-next" circle aria-label="下一张照片" @click="next" :disabled="!canNext">
      <el-icon><ArrowRight /></el-icon>
    </el-button>
  </div>
</template>

<style scoped>
.photo-viewer { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 2000; display: flex; align-items: center; justify-content: center; }
.viewer-close { position: absolute; top: 20px; right: 20px; z-index: 10; }
.viewer-prev, .viewer-next { position: absolute; top: 50%; transform: translateY(-50%); z-index: 10; }
.viewer-prev { left: 20px; }
.viewer-next { right: 20px; }
.viewer-content img { max-width: 90vw; max-height: 90vh; object-fit: contain; }
</style>
