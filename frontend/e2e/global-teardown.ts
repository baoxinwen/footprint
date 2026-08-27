import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(currentDir, '../../backend')
export const e2eDataRoot = path.join(backendDir, '.e2e-data')
const staleRunAgeMs = 60 * 60 * 1000
const deferredCleanupScript = String.raw`
const fs = require('node:fs')
const path = require('node:path')

const [dataDir, dataRoot] = process.argv.slice(1)
const deadline = Date.now() + 30_000

function attemptRemoval() {
  try {
    if (!fs.existsSync(dataDir)) process.exit(0)

    const realRoot = fs.realpathSync(dataRoot)
    const realTarget = fs.realpathSync(dataDir)
    const relativeTarget = path.relative(realRoot, realTarget)
    const isContained = relativeTarget !== ''
      && !relativeTarget.startsWith('..' + path.sep)
      && relativeTarget !== '..'
      && !path.isAbsolute(relativeTarget)
    const isRunDirectory = path.dirname(realTarget) === realRoot
      && path.basename(realTarget).startsWith('run-')

    if (!isContained || !isRunDirectory) process.exit(2)

    fs.rmSync(realTarget, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    })
    process.exit(0)
  } catch (error) {
    const retryable = error && (error.code === 'EBUSY' || error.code === 'EPERM')
    if (!retryable || Date.now() >= deadline) process.exit(1)
    setTimeout(attemptRemoval, 100)
  }
}

attemptRemoval()
`

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

function scheduleE2EDataDirRemoval(dataDir: string): void {
  const cleanupProcess = spawn(
    process.execPath,
    ['-e', deferredCleanupScript, dataDir, e2eDataRoot],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  )
  cleanupProcess.unref()
}

export default function globalTeardown() {
  const dataDir = process.env.FOOTPRINT_E2E_DATA_DIR
  if (dataDir && !removeE2EDataDir(dataDir)) {
    scheduleE2EDataDirRemoval(dataDir)
  }
}
