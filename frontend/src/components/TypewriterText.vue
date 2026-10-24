<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

// 流式打字（铁律 4）：单字 90ms 从 blur(6px) 到清晰，相邻字错开 30ms。
// 动画本体在 main.css 的 .tw-char；这里负责拆字与无障碍：
// 容器 aria-label 读完整文本，动画字符对读屏隐藏；
// prefers-reduced-motion 下整段直接呈现。
const props = withDefaults(
  defineProps<{
    text: string
    /** 是否启用逐字动画（reduced-motion 时自动关闭） */
    animated?: boolean
  }>(),
  { animated: true },
)

const chars = computed(() => Array.from(props.text))
const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})
</script>

<template>
  <span class="typewriter" role="text" :aria-label="text">
    <span
      v-if="animated && !prefersReducedMotion"
      aria-hidden="true"
      class="typewriter-chars"
    >
      <span
        v-for="(char, index) in chars"
        :key="`${index}-${char}`"
        class="tw-char"
        :style="{ animationDelay: `${index * 30}ms` }"
        >{{ char }}</span
      >
    </span>
    <span v-else aria-hidden="true">{{ text }}</span>
  </span>
</template>

<style scoped>
.typewriter-chars {
  display: inline;
}
</style>
