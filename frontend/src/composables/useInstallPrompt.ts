import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/** 用户在原生安装对话框里的选择 */
export interface InstallChoice {
  outcome: 'accepted' | 'dismissed'
  platform: string
}

/** 浏览器在满足安装条件时派发的事件；prompt() 弹出原生的安装对话框 */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<InstallChoice>
}

/**
 * native：浏览器提供了原生安装对话框，显示「安装」按钮
 * instructions：没有原生对话框，告诉用户去浏览器菜单里找
 * ios：iOS 上的浏览器都没有这个对话框，步骤是固定的
 * hidden：已经作为独立应用运行，不必再装
 */
export type InstallGuide = 'native' | 'instructions' | 'ios' | 'hidden'

export type InstallOutcome = InstallChoice['outcome']

export interface InstallEnvironment {
  /** 是否已作为独立应用运行 */
  standalone?: () => boolean
  /** 是否 iOS 上的浏览器（都没有原生安装对话框） */
  ios?: () => boolean
}

/** 以独立窗口或全屏方式运行；iOS 主屏启动靠 navigator.standalone 标记 */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPadOS 13 起默认把自己报成 Macintosh，靠触控点数区分 */
export function isIosBrowser(): boolean {
  const userAgent = navigator.userAgent
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
}

export function useInstallPrompt(environment: InstallEnvironment = {}) {
  const isRunningAsApp = environment.standalone ?? isStandalone
  const isIos = environment.ios ?? isIosBrowser

  const runningAsApp = ref(isRunningAsApp())
  const canPrompt = ref(false)
  let deferredPrompt: InstallPromptEvent | null = null

  function capture(event: Event) {
    // 接管浏览器自带的安装提示，由应用自己决定何时引导
    event.preventDefault()
    deferredPrompt = event as InstallPromptEvent
    canPrompt.value = true
  }

  function markInstalled() {
    runningAsApp.value = true
    canPrompt.value = false
    deferredPrompt = null
  }

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', markInstalled)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', capture)
    window.removeEventListener('appinstalled', markInstalled)
  })

  /** 弹出原生安装对话框并返回用户的选择；这个对话框事件只能用一次 */
  async function promptInstall(): Promise<InstallOutcome | 'unavailable'> {
    const event = deferredPrompt
    if (!event) return 'unavailable'
    deferredPrompt = null
    canPrompt.value = false
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome
  }

  const guide = computed<InstallGuide>(() => {
    if (runningAsApp.value) return 'hidden'
    if (isIos()) return 'ios'
    return canPrompt.value ? 'native' : 'instructions'
  })

  return { guide, promptInstall }
}
