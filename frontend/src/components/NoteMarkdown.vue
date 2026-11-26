<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  acquireImageResource,
  isPrivatePhotoUrl,
  type ImageResource,
} from '../utils/authenticatedImage'
import { renderMarkdown } from '../utils/markdown'

// 游记渲染（评审 I-6）：v-html 产出的 <img> 不经过 axios 拦截器，站内照片
// 地址不带 Authorization 会 401。这里在渲染后把站内图片换成经鉴权取得的
// blob；分享页则改写为 token 作用域的匿名地址。外链图片原样保留。
const props = defineProps<{
  note: string | null
  /** 分享页传入：把 /api/photos/{id}/… 改写为 /api/shares/view/{token}/photos/{id}/… */
  shareToken?: string
}>()

const html = computed(() => renderMarkdown(props.note ?? ''))
const container = ref<HTMLElement | null>(null)
let resources: ImageResource[] = []

function releaseAll() {
  resources.forEach((resource) => resource.release())
  resources = []
}

async function hydrateImages() {
  releaseAll()
  await nextTick()
  const root = container.value
  if (!root) return
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? ''
    if (!src) continue
    if (props.shareToken) {
      const matched = /^\/api\/photos\/(\d+)\/(original|thumbnail)(?:$|\?)/.exec(src)
      if (matched) {
        img.src = `/api/shares/view/${props.shareToken}/photos/${matched[1]}/${matched[2]}`
      }
      continue
    }
    if (!isPrivatePhotoUrl(src)) continue
    try {
      const resource = await acquireImageResource(src)
      resources.push(resource)
      img.src = resource.src
    } catch {
      // 取图失败：保留原地址，浏览器呈现破图（与接口拒绝语义一致）
    }
  }
}

watch(() => html.value, hydrateImages, { immediate: true })
onBeforeUnmount(releaseAll)
</script>

<template>
  <div ref="container" class="markdown-body" v-html="html"></div>
</template>
