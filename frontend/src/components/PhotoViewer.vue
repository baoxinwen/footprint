<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { ArrowLeft, ArrowRight, Close } from '@element-plus/icons-vue'

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

function prev() { if (canPrev.value) emit('update:index', props.index - 1) }
function next() { if (canNext.value) emit('update:index', props.index + 1) }

function handleKeydown(e: KeyboardEvent) {
  if (!props.visible) return
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft' && props.index > 0) emit('update:index', props.index - 1)
  if (e.key === 'ArrowRight' && props.index < props.photos.length - 1) emit('update:index', props.index + 1)
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div v-if="visible" class="photo-viewer" @click.self="emit('close')">
    <el-button class="viewer-close" circle @click="emit('close')">
      <el-icon><Close /></el-icon>
    </el-button>
    <el-button class="viewer-prev" circle @click="prev" :disabled="!canPrev">
      <el-icon><ArrowLeft /></el-icon>
    </el-button>
    <div class="viewer-content">
      <img :src="photos[index]?.original_url" />
    </div>
    <el-button class="viewer-next" circle @click="next" :disabled="!canNext">
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
