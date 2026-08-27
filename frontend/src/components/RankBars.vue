<script setup lang="ts">
import { computed } from 'vue'
import type { CityRank } from '../types'

const props = withDefaults(
  defineProps<{
    items: CityRank[]
    clickable?: boolean
  }>(),
  { clickable: true },
)

const emit = defineEmits<{ select: [city: string] }>()

const maxCount = computed(() => Math.max(1, ...props.items.map((i) => i.count)))

function barWidth(count: number) {
  // 至少 6% 保证单次到访也有可见条形
  return Math.max(6, Math.round((count / maxCount.value) * 100))
}

function rankClass(index: number) {
  if (index === 0) return 'rank-1'
  if (index === 1) return 'rank-2'
  if (index === 2) return 'rank-3'
  return ''
}
</script>

<template>
  <ol class="rank-list">
    <li v-for="(item, index) in items" :key="item.city" class="rank-row">
      <button
        type="button"
        class="rank-main"
        :disabled="!clickable"
        :aria-label="clickable ? `${item.city}到访${item.count}次，查看旅行` : undefined"
        @click="clickable && emit('select', item.city)"
      >
        <span :class="['rank-badge', rankClass(index)]">{{ index + 1 }}</span>
        <span class="rank-info">
          <span class="rank-city">{{ item.city }}</span>
          <span class="rank-track">
            <span class="rank-fill" :style="{ width: barWidth(item.count) + '%' }"></span>
          </span>
        </span>
        <span class="rank-count">{{ item.count }} 次</span>
      </button>
    </li>
  </ol>
</template>

<style scoped>
.rank-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.rank-main {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dur-fast) ease;
}

.rank-main:hover:not(:disabled) {
  background: var(--color-surface-muted);
}

.rank-main:disabled {
  cursor: default;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  font-family: var(--font-serif);
  font-size: var(--text-sm);
  font-weight: 700;
  background: var(--color-surface-muted);
  color: var(--color-ink-secondary);
  flex-shrink: 0;
}

.rank-badge.rank-1 {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.rank-badge.rank-2 {
  background: var(--color-accent-soft);
  color: var(--color-accent-hover);
}

.rank-badge.rank-3 {
  background: color-mix(in srgb, var(--color-accent) 18%, var(--color-surface));
  color: var(--color-accent-hover);
}

.rank-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rank-city {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-ink);
}

.rank-track {
  display: block;
  height: 4px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  overflow: hidden;
}

.rank-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 65%, var(--color-accent)));
  transition: width 600ms var(--ease-out);
}

.rank-count {
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>
