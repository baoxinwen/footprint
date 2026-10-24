import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(currentDir, '../../backend')
export const e2eDataRoot = path.join(backendDir, '.e2e-data')
const staleRunAgeMs = 60 * 60 * 1000

function isRetryableRemovalError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error.code === 'EBUSY' || error.code === 'EPERM')
}

export function cleanupStaleE2EDataDirs(now = Date.now()): number {
  fs.mkdirSync(e2eDataRoot, { recursive: true })
  const realRoot = fs.realpathSync(e2eDataRoot)
  let removed = 0

  for (const entry of fs.readdirSync(realRoot, { withFileTypes: true })) {
    if (!entry.name.startsWith('run-') || !entry.isDirectory() || entry.isSymbolicLink()) continue
    const target = path.join(realRoot, entry.name)
    if (now - fs.statSync(target).mtimeMs <= staleRunAgeMs) continue
    if (removeE2EDataDir(target)) removed += 1
  }

  return removed
}

export function createE2EDataDir(): string {
  cleanupStaleE2EDataDirs()
  fs.mkdirSync(e2eDataRoot, { recursive: true })
  const realRoot = fs.realpathSync(e2eDataRoot)
  return fs.mkdtempSync(path.join(realRoot, 'run-'))
}

export function removeE2EDataDir(dataDir: string | undefined): boolean {
  if (!dataDir || !fs.existsSync(dataDir)) return true

  fs.mkdirSync(e2eDataRoot, { recursive: true })
  const realRoot = fs.realpathSync(e2eDataRoot)
  const realTarget = fs.realpathSync(dataDir)
  const relativeTarget = path.relative(realRoot, realTarget)
  const isContained = relativeTarget !== ''
    && !relativeTarget.startsWith(`..${path.sep}`)
    && relativeTarget !== '..'
    && !path.isAbsolute(relativeTarget)
  const isRunDirectory = path.dirname(realTarget) === realRoot
    && path.basename(realTarget).startsWith('run-')

  if (!isContained || !isRunDirectory) {
    throw new Error(`Refusing to delete E2E data outside backend/.e2e-data: ${realTarget}`)
  }

  try {
    fs.rmSync(realTarget, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    })
    return true
  } catch (error) {
    if (isRetryableRemovalError(error)) return false
    throw error
  }
}

/** 主线程同步休眠（teardown 阶段阻塞无碍）。 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * E2E 数据目录删除失败时的进程内有界重试。
 *
 * 不再 spawn detached 解释器做延迟清理（安全扫描按命令注入/解释器输入拦截）：
 * 重试期过后仍被占用的目录留在 backend/.e2e-data/run-*，由下次运行
 * cleanupStaleE2EDataDirs（>1h 陈旧清扫）统一回收。
 */
function removeWithBoundedRetries(dataDir: string, attempts = 5, intervalMs = 500): boolean {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (removeE2EDataDir(dataDir)) return true
    if (attempt < attempts) sleepSync(intervalMs)
  }
  return false
}

export default function globalTeardown() {
  const dataDir = process.env.FOOTPRINT_E2E_DATA_DIR
  if (dataDir && !removeE2EDataDir(dataDir)) {
    removeWithBoundedRetries(dataDir)
  }
}
