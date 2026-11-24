import { nextTick } from 'vue'

/** jsdom 里 navigator.onLine 是固定值，派发 online / offline 事件也不会变，只能手动改写 */
export const setOnline = (value: boolean) =>
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })

/** 模拟断网：浏览器会先更新 navigator.onLine 再派发事件，这里保持同样的顺序 */
export async function goOffline() {
  setOnline(false)
  window.dispatchEvent(new Event('offline'))
  await nextTick()
}

/** 模拟恢复联网 */
export async function goOnline() {
  setOnline(true)
  window.dispatchEvent(new Event('online'))
  await nextTick()
}
