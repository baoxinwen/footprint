<script setup lang="ts">
import { computed } from 'vue'
import { Calendar, DataAnalysis, MapLocation, Suitcase } from '@element-plus/icons-vue'

const props = defineProps<{
  icon?: 'map' | 'calendar' | 'stats' | 'trips'
  title: string
  description?: string
  actionText?: string
}>()

const icons = { map: MapLocation, calendar: Calendar, stats: DataAnalysis, trips: Suitcase }
const iconComponent = computed(() => props.icon ? icons[props.icon] : null)

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="empty-state">
    <div v-if="iconComponent" class="empty-icon" aria-hidden="true">
      <el-icon><component :is="iconComponent" /></el-icon>
    </div>
    <p class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <button v-if="actionText" class="empty-action" @click="emit('action')">
      <span aria-hidden="true">+</span> {{ actionText }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}
.empty-icon { font-size: 44px; margin-bottom: 16px; color: var(--color-primary); }
.empty-icon .el-icon { display: block; }
.empty-title { font-family: var(--font-serif); font-size: 20px; font-weight: 600; margin-bottom: 8px; }
.empty-desc { font-size: 14px; color: var(--color-ink-muted); margin-bottom: 24px; }
.empty-action {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 44px; padding: 10px 24px; border: none; border-radius: 999px;
  background: var(--color-primary); color: var(--color-on-primary); font-size: 14px;
  font-weight: 600; cursor: pointer;
  transition: background-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}
.empty-action:hover { background: var(--color-primary-hover); box-shadow: var(--shadow-primary); }
</style>
