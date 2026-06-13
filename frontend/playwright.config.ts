import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendDir = path.resolve(__dirname, '../backend')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'e2e-report' }]],
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'python -m uvicorn app.main:app --port 8000',
      cwd: backendDir,
      port: 8000,
      reuseExistingServer: true,
      timeout: 30000,
      env: {
        JWT_SECRET: 'e2e-test-secret-key-for-testing-only',
        AMAP_KEY: 'test-amap-key',
        REGISTER_MAX_PER_HOUR: '10000',
        LOGIN_MAX_ATTEMPTS: '10000',
        LOGIN_LOCKOUT_MINUTES: '1',
        PASSWORD_CHANGE_COOLDOWN_HOURS: '0',
      },
    },
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
})
