<script setup lang="ts">
import AuthenticatedImage from './AuthenticatedImage.vue'

const props = withDefaults(
  defineProps<{
    src?: string | null
    alt: string
    fallbackText?: string
    ratio?: string
  }>(),
  {
    src: null,
    fallbackText: '旅',
    ratio: '16 / 10',
  },
)
</script>

<template>
  <div class="trip-cover" :style="{ aspectRatio: props.ratio }">
    <AuthenticatedImage v-if="src" :src="src" :alt="alt" class="cover-img" />
    <div v-else class="cover-fallback" aria-hidden="true">
      <svg class="contour" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
        <path d="M-20 150 C 60 120, 90 170, 160 140 S 280 90, 360 130" />
        <path d="M-20 110 C 50 84, 110 130, 180 100 S 290 60, 360 92" />
        <path d="M-20 70 C 40 50, 120 88, 200 62 S 300 34, 360 56" />
        <path d="M-20 34 C 60 18, 140 46, 220 28 S 320 10, 360 22" />
      </svg>
      <span class="fallback-char">{{ fallbackText }}</span>
    </div>
  </div>
</template>

<style scoped>
.trip-cover {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--color-surface-muted);
}

/* AuthenticatedImage 根元素即 <img>，从包装层用 :deep 定尺寸 */
.trip-cover :deep(.cover-img) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 480ms var(--ease-out);
}

.cover-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(150deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 72%, #0a0f0d) 100%);
}

.contour {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.22;
}

.contour path {
  fill: none;
  stroke: var(--color-on-primary);
  stroke-width: 1.4;
}

.fallback-char {
  position: relative;
  font-family: var(--font-serif);
  font-size: 44px;
  font-weight: 700;
  color: var(--color-on-primary);
  opacity: 0.92;
  line-height: 1;
}
</style>
