<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Link } from '@element-plus/icons-vue'

const router = useRouter()
</script>

<template>
  <main class="expired-page">
    <section class="expired-content" aria-labelledby="expired-title">
      <div class="expired-icon" aria-hidden="true">
        <el-icon><Link /></el-icon>
        <span class="link-break"></span>
      </div>
      <p class="expired-kicker">链接不可用</p>
      <h1 id="expired-title">该分享链接已过期</h1>
      <p class="expired-message">分享链接已超过有效期，请联系分享者获取新链接。</p>
      <button type="button" class="dismiss-button" @click="router.push('/')">返回首页</button>
      <p class="brand-footer">由 <strong>旅行足迹</strong> 记录生成</p>
    </section>
  </main>
</template>

<style scoped>
.expired-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl) 20px;
  background:
    radial-gradient(90% 70% at 50% 0%, color-mix(in srgb, var(--color-primary) 7%, transparent) 0%, transparent 60%),
    var(--color-canvas);
}

.expired-content {
  width: min(100%, 440px);
  text-align: center;
  color: var(--color-ink-secondary);
}

.expired-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin: 0 auto var(--space-lg);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-danger);
  font-size: 26px;
}

.link-break {
  position: absolute;
  width: 31px;
  height: 2px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-danger);
  transform: rotate(-45deg);
}

.expired-kicker {
  margin-bottom: var(--space-sm);
  color: var(--color-danger);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.18em;
}

.expired-content h1 {
  margin-bottom: var(--space-md);
  color: var(--color-ink);
  font-family: var(--font-serif);
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
}

.expired-message {
  max-width: 360px;
  margin: 0 auto var(--space-xl);
  color: var(--color-ink-muted);
  font-size: var(--text-base);
  line-height: 1.8;
}

.dismiss-button {
  height: 42px;
  padding: 0 32px;
  border: 0;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}

.dismiss-button:hover {
  background: var(--color-primary-hover);
  box-shadow: var(--shadow-primary);
}

.brand-footer {
  margin-top: var(--space-xl);
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
}

.brand-footer strong {
  font-family: var(--font-serif);
  color: var(--color-primary);
}
</style>
