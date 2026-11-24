import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { VitePWA } from 'vite-plugin-pwa'
import {
  API_DATA_CACHE,
  FONT_CACHE,
  THUMBNAIL_CACHE,
  isApiDataRequest,
  isFontRequest,
  isThumbnailRequest,
} from './src/pwa/cachePolicy'

const DAY = 24 * 60 * 60

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    // 离线与秒开。manifest 与注册都由应用自己管（public/manifest.webmanifest、
    // App.vue 里的 useRegisterSW），插件只负责生成 Service Worker。
    // 开发环境不启用，现有的 e2e 都跑在开发服务器上，不受影响。
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      workbox: {
        // 新的 Service Worker 激活后立即接管已打开的页面。两个用途缺一不可：
        // ① 用户点「立即刷新」后，页面靠「被接管」事件触发重载，否则会停在旧版本；
        // ② 首次安装后接管当前页面，这一次访问的接口请求才会进缓存——
        //    不然「已可离线使用」的提示出现时，缓存里其实还没有任何数据
        clientsClaim: true,
        // 预缓存应用壳。字体分片有近 200 个，不进预缓存，改走运行时缓存
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // 单页应用的导航一律回退到预缓存的 index.html。
        // /api/ 不是页面；/share/ 断网时宁可显示浏览器的离线页，
        // 也不要让分享页拿着拿不到的数据报「链接已失效」
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/share\//],
        runtimeCaching: [
          {
            urlPattern: isApiDataRequest,
            handler: 'NetworkFirst',
            options: {
              cacheName: API_DATA_CACHE,
              // 联网但很慢时 4 秒后先用上次的结果，不让界面干等
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 7 * DAY },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: isThumbnailRequest,
            handler: 'CacheFirst',
            options: {
              cacheName: THUMBNAIL_CACHE,
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * DAY },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: isFontRequest,
            handler: 'CacheFirst',
            options: {
              cacheName: FONT_CACHE,
              expiration: { maxEntries: 300 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
    css: true,
    server: {
      deps: {
        inline: ['element-plus'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/__tests__/**', 'src/main.ts', 'src/env.d.ts'],
    },
  },
  define: {
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
