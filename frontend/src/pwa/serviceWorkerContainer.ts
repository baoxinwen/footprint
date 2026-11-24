/**
 * 当前环境的 ServiceWorkerContainer。非安全上下文（HTTP）与测试环境里没有
 */
export function serviceWorkerContainer(): ServiceWorkerContainer | undefined {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined
}
