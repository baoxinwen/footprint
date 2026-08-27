<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useAuthenticatedImage } from '../composables/useAuthenticatedImage'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  src?: string
  alt: string
}>()

const { resolvedSrc, loading, pendingViewport, error, markRenderError, setTarget } = useAuthenticatedImage(toRef(props, 'src'))
const accessibleAlt = computed(() => error.value ? `${props.alt}（加载失败）` : props.alt)
// pending：图片在视口外等待懒加载——视觉与 loading 同为占位底色，
// 但语义上区分"排队中"与"请求中"
const busyState = computed(() => error.value ? 'error' : (loading.value || pendingViewport.value) ? 'loading' : 'ready')
</script>

<template>
  <img
    v-bind="$attrs"
    :ref="setTarget"
    :src="resolvedSrc || undefined"
    :alt="accessibleAlt"
    :title="error ? '照片加载失败，请稍后重试' : undefined"
    :aria-busy="loading || pendingViewport"
    :data-image-state="busyState"
    @error="markRenderError"
  />
</template>

<style scoped>
img[data-image-state='loading'],
img[data-image-state='error'] {
  background: var(--color-surface-muted, #e5ebe7);
}
</style>
