import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { acquireImageResource, isPrivatePhotoUrl, type ImageResource } from '../utils/authenticatedImage'

export function useAuthenticatedImage(source: MaybeRefOrGetter<string | undefined>) {
  const resolvedSrc = ref('')
  const loading = ref(false)
  const error = ref(false)
  // 懒加载锚点元素：组件通过 setTarget 绑定到 <img>，
  // 进入视口才发起带鉴权的 blob 请求，避免大网格瞬间并发拉取全部图片
  const targetEl = ref<Element | null>(null)
  // 图片已就绪但仍在视口外等待懒加载：用于向组件暴露 pending 态，
  // 避免空 src 的 <img> 被渲染成 data-image-state="ready" 的语义误导
  const pendingViewport = ref(false)

  let controller: AbortController | null = null
  let resource: ImageResource | null = null
  let generation = 0
  let observer: IntersectionObserver | null = null
  let pendingSrc: string | undefined

  function disposeCurrent() {
    controller?.abort()
    controller = null
    resource?.release()
    resource = null
  }

  function disconnectObserver() {
    observer?.disconnect()
    observer = null
  }

  async function load(src: string | undefined) {
    generation += 1
    const currentGeneration = generation
    pendingViewport.value = false
    disposeCurrent()
    resolvedSrc.value = ''
    error.value = false

    if (!src) {
      loading.value = false
      return
    }

    controller = new AbortController()
    const currentController = controller
    loading.value = isPrivatePhotoUrl(src)

    try {
      const loadedResource = await acquireImageResource(src, currentController.signal)
      if (currentGeneration !== generation || currentController.signal.aborted) {
        loadedResource.release()
        return
      }
      resource = loadedResource
      resolvedSrc.value = loadedResource.src
    } catch {
      if (!currentController.signal.aborted && currentGeneration === generation) error.value = true
    } finally {
      if (currentGeneration === generation) {
        loading.value = false
        if (controller === currentController) controller = null
      }
    }
  }

  function setTarget(el: unknown) {
    targetEl.value = (el as Element | null) ?? null
  }

  function markRenderError() {
    error.value = true
  }

  function schedule(src: string | undefined) {
    if (!src) {
      pendingSrc = undefined
      pendingViewport.value = false
      disconnectObserver()
      load(undefined)
      return
    }
    // 元素尚未挂载：等待模板 ref 绑定后由 watch 重新调度，避免绕过懒加载
    if (!targetEl.value) return
    // 环境不支持 IO 时退化为立即加载
    if (typeof IntersectionObserver === 'undefined') {
      load(src)
      return
    }
    pendingSrc = src
    pendingViewport.value = true
    disconnectObserver()
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        disconnectObserver()
        const next = pendingSrc
        pendingSrc = undefined
        pendingViewport.value = false
        load(next)
      },
      { rootMargin: '200px' },
    )
    observer.observe(targetEl.value)
  }

  watch([() => toValue(source), targetEl], ([src]) => schedule(src), { immediate: true })

  onScopeDispose(() => {
    generation += 1
    pendingViewport.value = false
    disposeCurrent()
    disconnectObserver()
  })

  return { resolvedSrc, loading, pendingViewport, error, markRenderError, setTarget }
}
