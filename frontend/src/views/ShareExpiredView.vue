<script setup lang="ts">
</script>

<template>
  <div class="expired-page">
    <div class="expired-content">
      <div class="expired-icon">🔗</div>
      <h2>该分享链接已过期</h2>
      <p>分享链接已超过有效期，请联系分享者获取新链接</p>
      <el-button type="primary" @click="$router.push('/')">返回首页</el-button>
    </div>
  </div>
</template>

<style scoped>
.expired-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expired-content {
  text-align: center;
  color: var(--el-text-color-secondary);
}

.expired-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.6;
}

.expired-content h2 {
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
}

.expired-content p {
  margin-bottom: 24px;
}
</style>
