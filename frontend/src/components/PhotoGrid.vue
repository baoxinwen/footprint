<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Photo } from '../types'
import AuthenticatedImage from './AuthenticatedImage.vue'
import PhotoViewer from './PhotoViewer.vue'

const props = withDefaults(
  defineProps<{
    photos: Photo[]
    deletable?: boolean
    showUpload?: boolean
    uploading?: boolean
    uploadingLabel?: string
  }>(),
  {
    deletable: false,
    showUpload: false,
    uploading: false,
    uploadingLabel: '上传照片',
  },
)

const emit = defineEmits<{
  delete: [photo: Photo]
  upload: []
}>()

const viewerVisible = ref(false)
const viewerIndex = ref(0)

watch(
  () => props.photos,
  (list) => {
    if (viewerVisible.value && viewerIndex.value >= list.length) {
      if (list.length === 0) {
        viewerVisible.value = false
      } else {
        viewerIndex.value = list.length - 1
      }
    }
  },
)

function openViewer(index: number) {
  viewerIndex.value = index
  viewerVisible.value = true
}
</script>

<template>
  <div class="photo-grid-wrap">
    <ul class="photo-grid">
      <li
        v-for="(photo, index) in photos"
        :key="photo.id"
        class="photo-cell"
      >
        <button
          type="button"
          class="photo-btn"
          :aria-label="`查看照片 ${index + 1}/${photos.length}`"
          @click="openViewer(index)"
        >
          <AuthenticatedImage :src="photo.thumbnail_url" :alt="photo.file_name" class="photo-img" />
        </button>
        <button
          v-if="deletable"
          type="button"
          class="photo-delete"
          :aria-label="`删除照片 ${photo.file_name}`"
          @click.stop="emit('delete', photo)"
        >
          <el-icon><Delete /></el-icon>
        </button>
      </li>

      <li v-if="showUpload" class="photo-cell upload-cell">
        <button type="button" class="upload-btn" :disabled="uploading" @click="emit('upload')">
          <el-icon class="upload-icon"><Plus /></el-icon>
          <span>{{ uploading ? '上传中…' : uploadingLabel }}</span>
        </button>
      </li>
    </ul>

    <PhotoViewer
      :photos="photos"
      :index="viewerIndex"
      :visible="viewerVisible"
      @close="viewerVisible = false"
      @update:index="viewerIndex = $event"
    />
  </div>
</template>

<style scoped>
.photo-grid {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: var(--space-sm);
}

.photo-cell {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-surface-muted);
}

.photo-btn {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  cursor: zoom-in;
  background: var(--color-surface-muted);
}

.photo-btn :deep(.photo-img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 360ms var(--ease-out);
}

.photo-btn:hover :deep(.photo-img) {
  transform: scale(1.04);
}

.photo-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: rgba(12, 18, 15, 0.62);
  color: #fff;
  opacity: 0;
  cursor: pointer;
  transition: opacity var(--dur-fast) ease, background-color var(--dur-fast) ease;
}

.photo-cell:hover .photo-delete,
.photo-delete:focus-visible {
  opacity: 1;
}

.photo-delete:hover {
  background: var(--color-danger);
}

@media (hover: none) {
  .photo-delete {
    opacity: 1;
  }
}

.upload-cell {
  border: 1.5px dashed var(--color-border-strong);
  background: transparent;
}

.upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--color-ink-muted);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: color var(--dur-base) ease, border-color var(--dur-base) ease;
}

.upload-cell:hover {
  border-color: var(--color-primary);
}

.upload-btn:hover:not(:disabled) {
  color: var(--color-primary);
}

.upload-btn:disabled {
  cursor: wait;
}

.upload-icon {
  font-size: 22px;
}
</style>
