import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import globalTeardown, { createE2EDataDir, e2eDataRoot } from '../../e2e/global-teardown'

const originalDataDir = process.env.FOOTPRINT_E2E_DATA_DIR

afterEach(() => {
  if (originalDataDir === undefined) {
    delete process.env.FOOTPRINT_E2E_DATA_DIR
  } else {
    process.env.FOOTPRINT_E2E_DATA_DIR = originalDataDir
  }
})

describe('Playwright E2E data cleanup', () => {
  it('refuses to delete a directory outside backend/.e2e-data', () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footprint-outside-'))
    const sentinel = path.join(outsideDir, 'keep.txt')
    fs.writeFileSync(sentinel, 'keep')
    process.env.FOOTPRINT_E2E_DATA_DIR = outsideDir

    try {
      expect(() => globalTeardown()).toThrow(/outside backend\/.e2e-data/)
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('keep')
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it('retries transient Windows file-lock failures while removing a run directory', () => {
    const runDir = fs.mkdtempSync(path.join(path.resolve('..', 'backend', '.e2e-data'), 'run-'))
    const removeSpy = vi.spyOn(fs, 'rmSync')

    try {
      process.env.FOOTPRINT_E2E_DATA_DIR = runDir
      globalTeardown()

      expect(removeSpy).toHaveBeenCalledWith(runDir, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 100,
      })
    } finally {
      removeSpy.mockRestore()
      fs.rmSync(runDir, { recursive: true, force: true })
    }
  })

  it('defers cleanup when the backend still holds the SQLite file', async () => {
    const runDir = fs.mkdtempSync(path.join(e2eDataRoot, 'run-'))
    const busyError = Object.assign(new Error('database is busy'), { code: 'EBUSY' })
    const removeSpy = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
      throw busyError
    })

    try {
      process.env.FOOTPRINT_E2E_DATA_DIR = runDir
      expect(() => globalTeardown()).not.toThrow()
      removeSpy.mockRestore()

      await vi.waitFor(() => {
        expect(fs.existsSync(runDir)).toBe(false)
      }, { timeout: 5000, interval: 20 })
    } finally {
      removeSpy.mockRestore()
      fs.rmSync(runDir, { recursive: true, force: true })
    }
  })

  it('reuses the parent run directory when Playwright config is imported by a worker', async () => {
    fs.mkdirSync(e2eDataRoot, { recursive: true })
    const runDir = fs.mkdtempSync(path.join(e2eDataRoot, 'run-'))
    const before = new Set(fs.readdirSync(e2eDataRoot))
    process.env.FOOTPRINT_E2E_DATA_DIR = runDir

    try {
      await import('../../playwright.config.ts?reuse-worker')
      const created = fs.readdirSync(e2eDataRoot).filter((entry) => !before.has(entry))
      expect(created).toEqual([])
    } finally {
      for (const entry of fs.readdirSync(e2eDataRoot)) {
        if (!before.has(entry)) {
          fs.rmSync(path.join(e2eDataRoot, entry), { recursive: true, force: true })
        }
      }
      fs.rmSync(runDir, { recursive: true, force: true })
    }
  })

  it('removes only stale run directories before creating the next isolated run', () => {
    fs.mkdirSync(e2eDataRoot, { recursive: true })
    const staleRun = fs.mkdtempSync(path.join(e2eDataRoot, 'run-'))
    const recentRun = fs.mkdtempSync(path.join(e2eDataRoot, 'run-'))
    const unrelatedDir = fs.mkdtempSync(path.join(e2eDataRoot, 'keep-'))
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    fs.utimesSync(staleRun, twoHoursAgo, twoHoursAgo)
    let createdRun = ''

    try {
      createdRun = createE2EDataDir()

      expect(fs.existsSync(staleRun)).toBe(false)
      expect(fs.existsSync(recentRun)).toBe(true)
      expect(fs.existsSync(unrelatedDir)).toBe(true)
      expect(path.dirname(createdRun)).toBe(fs.realpathSync(e2eDataRoot))
    } finally {
      for (const target of [staleRun, recentRun, unrelatedDir, createdRun]) {
        if (target) fs.rmSync(target, { recursive: true, force: true })
      }
    }
  })
})
