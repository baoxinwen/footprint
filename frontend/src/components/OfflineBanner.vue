<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// navigator.onLine 只是近似值（连着路由器但没外网时仍为 true），
// 所以这条提示只负责解释「看到的是缓存内容」，不用来挡任何操作。
// 默认排在顶栏下方的文档流里：不随内容滚动，安全区由顶栏负责。
// fixed：悬浮在页面最上方，用于没有顶栏的页面（登录、分享）。
withDefaults(
  defineProps<{
    fixed?: boolean
  }>(),
  { fixed: false },
)

const offline = ref(!navigator.onLine)
const sync = () => {
  offline.value = !navigator.onLine
}

onMounted(() => {
  window.addEventListener('online', sync)
  window.addEventListener('offline', sync)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', sync)
  window.removeEventListener('offline', sync)
})
</script>

<template>
  <div v-if="offline" class="offline-banner" :class="{ 'offline-banner-fixed': fixed }" role="status">
    当前离线，显示的是已缓存的内容；保存和删除需要联网
  </div>
</template>

<style scoped>
.offline-banner {
  flex-shrink: 0;
  padding: 8px 16px;
  background: var(--color-accent-soft);
  color: var(--color-ink);
  font-size: var(--text-sm);
  text-align: center;
}

.offline-banner-fixed {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  box-shadow: var(--shadow-card);
}
</style>
