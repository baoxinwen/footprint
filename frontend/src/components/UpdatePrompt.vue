<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  needRefresh: boolean
}>()

const emit = defineEmits<{
  refresh: []
  dismiss: []
}>()

// 「稍后」只对当前这一版生效：needRefresh 复位后再次出现时重新提示
const dismissed = ref(false)
watch(
  () => props.needRefresh,
  (value) => {
    if (!value) dismissed.value = false
  },
)

function dismiss() {
  dismissed.value = true
  emit('dismiss')
}
</script>

<template>
  <div v-if="needRefresh && !dismissed" class="update-prompt" role="status">
    <span class="update-text">有新版本可用</span>
    <button type="button" class="update-btn" @click="dismiss">稍后</button>
    <button type="button" class="update-btn update-btn-primary" @click="emit('refresh')">立即刷新</button>
  </div>
</template>

<style scoped>
/* 不阻塞的浮动卡片：不打断正在进行的操作，由用户决定何时切换版本 */
.update-prompt {
  position: fixed;
  right: var(--space-lg);
  bottom: calc(var(--space-lg) + env(safe-area-inset-bottom, 0px));
  z-index: 95;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-sm) var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-elevated);
  font-size: var(--text-sm);
  color: var(--color-ink);
}

.update-text {
  margin-right: var(--space-xs);
}

/* 这张卡片主要出现在装到手机上的场景，按钮高度按触控热区约定取 44px */
.update-btn {
  min-height: 44px;
  padding: 0 var(--space-md);
  border: 0;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-ink-secondary);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}

.update-btn:hover {
  color: var(--color-ink);
}

.update-btn-primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.update-btn-primary:hover {
  background: var(--color-primary-hover);
  color: var(--color-on-primary);
}

@media (max-width: 768px) {
  /* 手机：横贯底部标签栏上方；再抬高一段，避开新建/编辑旅行页固定的提交栏 */
  .update-prompt {
    left: var(--space-md);
    right: var(--space-md);
    bottom: calc(140px + env(safe-area-inset-bottom, 0px));
    justify-content: space-between;
  }
}
</style>
