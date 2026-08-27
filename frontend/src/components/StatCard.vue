<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    value: number
    icon?: string
    duration?: number
  }>(),
  {
    icon: undefined,
    duration: 900,
  },
)

const display = ref(0)
const rootRef = ref<HTMLElement | null>(null)
let rafId = 0

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function animateTo(target: number) {
  cancelAnimationFrame(rafId)
  if (prefersReducedMotion() || target === display.value) {
    display.value = target
    return
  }
  const from = 0
  const start = performance.now()
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / props.duration)
    const eased = 1 - Math.pow(1 - p, 3)
    display.value = Math.round(from + (target - from) * eased)
    if (p < 1) rafId = requestAnimationFrame(step)
  }
  rafId = requestAnimationFrame(step)
}

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    display.value = props.value
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        animateTo(props.value)
        io.disconnect()
      }
    },
    { threshold: 0.4 },
  )
  if (rootRef.value) io.observe(rootRef.value)
})

onUnmounted(() => cancelAnimationFrame(rafId))

watch(
  () => props.value,
  (v) => animateTo(v),
)
</script>

<template>
  <div ref="rootRef" class="stat-card">
    <span v-if="icon" class="stat-icon"><el-icon><component :is="icon" /></el-icon></span>
    <span class="stat-value">{{ display }}</span>
    <span class="stat-label">{{ label }}</span>
  </div>
</template>

<style scoped>
.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: var(--space-lg) var(--space-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
  transition: box-shadow var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.stat-card:hover {
  box-shadow: var(--shadow-card);
  transform: translateY(-2px);
}

.stat-icon {
  display: inline-flex;
  font-size: 20px;
  color: var(--color-primary);
  margin-bottom: 2px;
}

.stat-value {
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  line-height: 1;
  font-weight: 700;
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
  letter-spacing: 0.08em;
}
</style>
