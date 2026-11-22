<script setup lang="ts">
import AuthenticatedImage from './AuthenticatedImage.vue'

// TripDetail 与 ShareView 共用的旅行 hero 区块。
// 颜色走上下文变量：有封面时插槽内容坐在深色遮罩上用照片米白族，
// 无封面时回落到令牌墨色系；插槽内容（.hero-foot 等）在父组件里引用这些变量。
withDefaults(
  defineProps<{
    kicker: string
    title: string
    startDate: string
    endDate: string
    coverUrl?: string
    coverAuthenticated?: boolean
    cities?: string[]
    description?: string
    expiryNote?: string
    /** 公开分享页的紧凑档：标题降一级、body 变矮 */
    compact?: boolean
  }>(),
  {
    coverUrl: undefined,
    coverAuthenticated: false,
    cities: () => [],
    description: undefined,
    expiryNote: undefined,
    compact: false,
  },
)
</script>

<template>
  <header class="trip-hero" :class="{ 'no-cover': !coverUrl, compact }">
    <div v-if="coverUrl" class="hero-cover">
      <AuthenticatedImage
        v-if="coverAuthenticated"
        :src="coverUrl"
        :alt="title"
        class="hero-cover-img"
      />
      <!-- 公开分享页无鉴权，封面走原生 img -->
      <img v-else :src="coverUrl" :alt="title" class="hero-cover-img" />
      <div class="hero-shade" aria-hidden="true"></div>
    </div>
    <div class="hero-body">
      <p class="hero-kicker">{{ kicker }}</p>
      <h1 class="hero-title">{{ title }}</h1>
      <p class="hero-date">{{ startDate }} 至 {{ endDate }}</p>
      <div v-if="cities.length" class="hero-route" aria-label="途经城市">
        <span v-for="city in cities" :key="city" class="hero-city">{{ city }}</span>
      </div>
      <p v-if="description" class="hero-desc">{{ description }}</p>
      <p v-if="expiryNote" class="hero-expiry">{{ expiryNote }}</p>
      <slot name="foot"></slot>
    </div>
  </header>
</template>

<style scoped>
.trip-hero {
  /* 上下文变量：插槽内容通过继承取色，父组件无需 :deep */
  --hero-text: var(--color-on-photo);
  --hero-text-soft: color-mix(in srgb, var(--color-on-photo) 88%, transparent);
  --hero-text-faint: color-mix(in srgb, var(--color-on-photo) 68%, transparent);
  --hero-border: color-mix(in srgb, var(--color-on-photo) 22%);
  --hero-border-strong: color-mix(in srgb, var(--color-on-photo) 40%);
  --hero-chip-bg: color-mix(in srgb, var(--color-on-photo) 12%, transparent);
  --hero-btn-bg: color-mix(in srgb, var(--color-on-photo) 14%, transparent);
  --hero-btn-bg-hover: color-mix(in srgb, var(--color-on-photo) 26%, transparent);
  --hero-danger-text: #ffb4a6; /* 照片遮罩上 danger 文字提亮 */
  --hero-danger-border: color-mix(in srgb, #ffb4a6 60%, transparent);
  --hero-danger-bg-hover: color-mix(in srgb, var(--color-danger) 28%, transparent);

  position: relative;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-lg);
}

.trip-hero.no-cover {
  --hero-text: var(--color-ink);
  --hero-text-soft: var(--color-ink-secondary);
  --hero-text-faint: var(--color-ink-secondary);
  --hero-border: var(--color-border);
  --hero-border-strong: var(--color-border-strong);
  --hero-chip-bg: color-mix(in srgb, var(--color-primary) 12%, transparent);
  --hero-btn-bg: var(--color-surface);
  --hero-btn-bg-hover: var(--color-surface-muted);
  --hero-danger-text: var(--color-danger);
  --hero-danger-border: color-mix(in srgb, var(--color-danger) 40%, transparent);
  --hero-danger-bg-hover: var(--color-danger-soft);
}

.hero-cover {
  position: absolute;
  inset: 0;
}

.hero-cover :deep(.hero-cover-img),
.hero-cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 封面遮罩：地图/照片语境的深色 scrim，仅此一处 */
.hero-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(10, 16, 13, 0.88) 0%,
    rgba(10, 16, 13, 0.55) 45%,
    rgba(10, 16, 13, 0.18) 100%
  );
}

.hero-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 380px;
  justify-content: flex-end;
  padding: var(--space-2xl) clamp(var(--space-lg), 4vw, var(--space-2xl)) var(--space-lg);
  color: var(--hero-text);
}

.trip-hero.compact .hero-body {
  min-height: 340px;
  padding: var(--space-2xl) var(--space-xl) var(--space-lg);
}

.trip-hero.no-cover .hero-body {
  min-height: 0;
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--color-primary) 26%, transparent) 0%, transparent 55%),
    var(--color-surface);
}

.hero-kicker {
  font-size: var(--text-xs);
  font-weight: var(--fw-semibold);
  letter-spacing: 0.22em;
  color: var(--color-accent);
  margin-bottom: var(--space-sm);
}

.hero-title {
  font-family: var(--font-serif);
  font-size: var(--text-3xl);
  line-height: var(--lh-3xl);
  font-weight: var(--fw-bold);
  color: inherit;
  text-wrap: balance;
}

.trip-hero.compact .hero-title {
  font-size: var(--text-2xl);
  line-height: var(--lh-2xl);
}

.trip-hero:not(.no-cover) .hero-title {
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.35);
}

.hero-date {
  margin-top: var(--space-sm);
  font-size: var(--text-sm);
  letter-spacing: 0.12em;
  color: var(--hero-text-soft);
}

.hero-route {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.hero-city {
  padding: 4px 12px;
  border: 1px solid var(--hero-border-strong);
  border-radius: 999px;
  background: var(--hero-chip-bg);
  backdrop-filter: blur(4px);
  color: var(--hero-text);
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
}

.hero-desc {
  margin-top: var(--space-md);
  max-width: 640px;
  font-size: var(--text-base);
  line-height: 1.7;
  color: var(--hero-text-soft);
}

.hero-expiry {
  margin-top: var(--space-md);
  align-self: flex-start;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--hero-border-strong);
  background: var(--hero-chip-bg);
  font-size: var(--text-xs);
  color: var(--hero-text-soft);
}

.trip-hero.no-cover .hero-expiry {
  color: var(--color-ink-muted);
  background: var(--color-surface-muted);
}

/* 移动端：详情页档断点 900px、公开分享档断点 768px（与两处父布局一致） */
@media (max-width: 900px) {
  .trip-hero:not(.compact) .hero-body {
    min-height: 300px;
    padding: var(--space-xl) var(--space-lg) var(--space-lg);
  }

  .trip-hero:not(.compact) .hero-title {
    font-size: var(--text-xl);
    line-height: var(--lh-xl);
  }
}

@media (max-width: 768px) {
  .trip-hero.compact .hero-body {
    min-height: 280px;
    padding: var(--space-xl) var(--space-lg) var(--space-lg);
  }

  .trip-hero.compact .hero-title {
    font-size: var(--text-xl);
    line-height: var(--lh-xl);
  }
}
</style>
