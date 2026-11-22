<script setup lang="ts">
import { computed } from 'vue'
import type { MonthlyStats } from '../types'

const props = defineProps<{
  items: MonthlyStats[]
}>()

const bars = computed(() => {
  const byMonth = new Map(props.items.map((i) => [i.month, i.count]))
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    count: byMonth.get(i + 1) ?? 0,
  }))
})

const maxCount = computed(() => Math.max(1, ...bars.value.map((b) => b.count)))
const maxMonth = computed(() => bars.value.reduce((a, b) => (b.count > a.count ? b : a)).month)

// 图表绘制区尺寸（viewBox 坐标）
const W = 640
const H = 220
const PAD_TOP = 28
const PAD_BOTTOM = 30
const GAP = 14

const geometry = computed(() => {
  const n = bars.value.length
  const bw = (W - GAP * (n - 1)) / n
  const plotH = H - PAD_TOP - PAD_BOTTOM
  return bars.value.map((b, i) => {
    const h = Math.max(2, (b.count / maxCount.value) * plotH)
    return {
      ...b,
      x: i * (bw + GAP),
      y: H - PAD_BOTTOM - h,
      w: bw,
      h,
      isPeak: b.month === maxMonth.value && b.count > 0,
    }
  })
})
</script>

<template>
  <div class="month-chart">
    <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid meet" role="img" aria-label="月度旅行次数分布柱状图">
      <!-- 数值标签 -->
      <text
        v-for="g in geometry"
        v-show="g.count > 0"
        :key="'v' + g.month"
        class="value-label"
        :class="{ 'is-peak': g.isPeak }"
        :x="g.x + g.w / 2"
        :y="g.y - 8"
        text-anchor="middle"
      >
        {{ g.count }}
      </text>
      <!-- 柱体 -->
      <g v-for="g in geometry" :key="'b' + g.month">
        <rect
          class="bar-bg"
          :x="g.x"
          :y="PAD_TOP"
          :width="g.w"
          :height="H - PAD_TOP - PAD_BOTTOM"
          rx="6"
        />
        <rect
          :class="['bar-fill', { 'is-peak': g.isPeak }]"
          :x="g.x"
          :y="g.y"
          :width="g.w"
          :height="g.h"
          rx="6"
        />
      </g>
      <!-- 基线 -->
      <line class="axis" :x1="0" :x2="W" :y1="H - PAD_BOTTOM + 0.5" :y2="H - PAD_BOTTOM + 0.5" />
      <!-- 月份标签 -->
      <text
        v-for="g in geometry"
        :key="'m' + g.month"
        class="month-label"
        :x="g.x + g.w / 2"
        :y="H - PAD_BOTTOM + 20"
        text-anchor="middle"
      >
        {{ g.month }}月
      </text>
    </svg>
    <!-- 读屏数据等价物：role="img" 下 SVG 内文本不可达，走隐藏表格 -->
    <table class="visually-hidden">
      <caption>月度旅行次数分布</caption>
      <thead>
        <tr><th scope="col">月份</th><th scope="col">次数</th></tr>
      </thead>
      <tbody>
        <tr v-for="b in bars" :key="'sr' + b.month">
          <th scope="row">{{ b.month }}月</th>
          <td>{{ b.count }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.month-chart svg {
  display: block;
  width: 100%;
  height: auto;
}

.value-label {
  font-size: var(--text-sm);
  font-weight: var(--fw-semibold);
  fill: var(--color-ink-secondary);
  font-variant-numeric: tabular-nums;
}

.value-label.is-peak {
  fill: var(--color-accent);
}

.bar-bg {
  fill: var(--color-surface-muted);
  opacity: 0.6;
}

.bar-fill {
  fill: var(--color-primary);
  opacity: 0.92;
  /* 入场生长动画走 CSS（SMIL 不受全局 reduced-motion 降级管束）：
     scaleY 从柱底长出，等效于高度 0→h */
  transform-box: fill-box;
  transform-origin: bottom;
  animation: barGrow var(--dur-settle) var(--ease-out) both;
}

@keyframes barGrow {
  from {
    transform: scaleY(0);
  }
  to {
    transform: scaleY(1);
  }
}

.bar-fill.is-peak {
  fill: var(--color-accent);
}

.axis {
  stroke: var(--color-border-strong);
  stroke-width: 1;
}

.month-label {
  font-size: var(--text-xs);
  fill: var(--color-ink-muted);
}
</style>
