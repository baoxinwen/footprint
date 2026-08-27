<script setup lang="ts">
defineProps<{
  kicker?: string
  title: string
  description?: string
}>()
</script>

<template>
  <header class="page-header">
    <div class="page-header-text">
      <p v-if="kicker" class="page-kicker">{{ kicker }}</p>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="page-desc">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-lg);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.page-kicker {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.22em;
  color: var(--color-accent);
  margin-bottom: var(--space-sm);
}

.page-title {
  font-size: var(--text-2xl);
  line-height: var(--lh-2xl);
  font-weight: 700;
}

.page-desc {
  margin-top: var(--space-sm);
  font-size: var(--text-base);
  color: var(--color-ink-secondary);
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
  padding-bottom: 4px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .page-title {
    font-size: var(--text-xl);
    line-height: var(--lh-xl);
  }

  .page-header-actions {
    padding-bottom: 0;
  }
}
</style>
