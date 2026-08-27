<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'cards' | 'rows'
    count?: number
  }>(),
  {
    variant: 'cards',
    count: 6,
  },
)
</script>

<template>
  <div v-if="variant === 'cards'" class="skeleton-cards" aria-hidden="true">
    <div v-for="i in count" :key="i" class="skeleton-card">
      <div class="skeleton cover"></div>
      <div class="skeleton line w-70"></div>
      <div class="skeleton line w-45"></div>
    </div>
  </div>
  <div v-else class="skeleton-rows" aria-hidden="true">
    <div v-for="i in count" :key="i" class="skeleton-row">
      <div class="skeleton circle"></div>
      <div class="skeleton-row-lines">
        <div class="skeleton line w-30"></div>
        <div class="skeleton line w-70"></div>
        <div class="skeleton line w-55"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-lg);
}

.skeleton-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  background: var(--color-surface);
}

.skeleton.cover {
  aspect-ratio: 16 / 10;
  margin-bottom: var(--space-md);
}

.skeleton.line {
  height: 14px;
  margin-bottom: 10px;
}

.skeleton.circle {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  flex-shrink: 0;
}

.w-30 { width: 30%; }
.w-45 { width: 45%; }
.w-55 { width: 55%; }
.w-70 { width: 70%; }

.skeleton-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.skeleton-row {
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
}

.skeleton-row-lines {
  flex: 1;
  padding-top: 2px;
}

@media (max-width: 1280px) {
  .skeleton-cards { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 768px) {
  .skeleton-cards { grid-template-columns: 1fr; }
}
</style>
