import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'url'
import path from 'path'
import { createE2EDataDir } from './e2e/global-teardown'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendDir = path.resolve(__dirname, '../backend')
const e2eDataDir = process.env.FOOTPRINT_E2E_DATA_DIR || createE2EDataDir()
process.env.FOOTPRINT_E2E_DATA_DIR = e2eDataDir
const databasePath = path.join(e2eDataDir, 'footprint.db').replace(/\\/g, '/')
const backendPort = 18123
const frontendPort = 15173
// 生产构建的预览服务器。开发模式不注册 Service Worker，离线与更新行为只存在于构建产物里
const previewPort = 15174

export default defineConfig({
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'e2e-report' }]],
  timeout: 30000,
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${frontendPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testDir: './e2e',
      use: {
        ...devices['Desktop Chrome'],
        // 分享功能依赖剪贴板写入；headless 默认无权限，会走"弹窗展示链接"兜底分支
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    {
      name: 'pwa',
      testDir: './e2e-pwa',
      // 装配 Service Worker、预缓存全部资源、断网重开都比普通页面操作慢
      timeout: 60000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${previewPort}`,
      },
    },
  ],
  webServer: [
    {
      command: `python -m uvicorn app.main:app --port ${backendPort}`,
      cwd: backendDir,
      port: backendPort,
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        JWT_SECRET: 'e2e-test-secret-key-for-testing-only',
        AMAP_KEY: 'test-amap-key',
        REGISTER_MAX_PER_HOUR: '10000',
        LOGIN_MAX_ATTEMPTS: '10000',
        LOGIN_LOCKOUT_MINUTES: '1',
        PASSWORD_CHANGE_COOLDOWN_HOURS: '0',
        DATABASE_URL: `sqlite:///${databasePath}`,
        UPLOAD_DIR: path.join(e2eDataDir, 'uploads'),
        EXPORT_TMP_DIR: path.join(e2eDataDir, 'tmp'),
        FOOTPRINT_E2E_DATA_DIR: e2eDataDir,
      },
    },
    {
      command: `npm run dev -- --port ${frontendPort} --strictPort`,
      port: frontendPort,
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        VITE_API_PROXY_TARGET: `http://localhost:${backendPort}`,
        FOOTPRINT_E2E_DATA_DIR: e2eDataDir,
      },
    },
    {
      // 每次都重新构建：pwa 项目必须验证当前源码的产物，而不是上一次留下的 dist
      command: `npm run build && npm run preview -- --port ${previewPort} --strictPort`,
      port: previewPort,
      reuseExistingServer: false,
      timeout: 180000,
      env: {
        VITE_API_PROXY_TARGET: `http://localhost:${backendPort}`,
      },
    },
  ],
})
