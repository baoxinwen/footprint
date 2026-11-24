// 生成 PWA 图标：用项目已有的 Playwright（Chromium）把 SVG 光栅化成 PNG。
// 图形只在 scripts/pwa-icons/ 里维护；改动后运行 `npm run icons`，
// 产物 public/icons/*.png 需要一并提交。
import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, 'pwa-icons')
const outDir = path.resolve(here, '../public/icons')

// 与 public/favicon.svg 同一套底色与圆角：标签页图标和主屏图标是同一个标记
const TILE = { fill: '#f3f6f4', radius: 9 }

/** 48 单位画布的应用图标：底板 + 居中的标记（可缩放，用于安全区） */
const appIcon = (mark, { fullBleed, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="${fullBleed ? 0 : TILE.radius}" fill="${TILE.fill}"/>
  <g transform="translate(24 24) scale(${scale}) translate(-24 -24)">${mark.trim()}</g>
</svg>`

const TARGETS = [
  // 常规图标：安装弹窗、应用信息、不支持自适应图标的启动器
  { file: 'icon-192.png', size: 192, mark: { fullBleed: false, scale: 1 } },
  { file: 'icon-512.png', size: 512, mark: { fullBleed: false, scale: 1 } },
  // maskable：满底不透明，图案缩进安全区（中央直径 80% 的圆），外形由启动器裁
  { file: 'icon-maskable-512.png', size: 512, mark: { fullBleed: true, scale: 0.76 } },
  // iOS：满底不透明，圆角由系统裁；留一点边距免得图钉尖顶着圆角
  { file: 'apple-touch-icon.png', size: 180, mark: { fullBleed: true, scale: 0.9 } },
  // 长按图标的快捷方式
  { file: 'shortcut-new-96.png', size: 96, svg: 'shortcut-new.svg' },
  { file: 'shortcut-timeline-96.png', size: 96, svg: 'shortcut-timeline.svg' },
  { file: 'shortcut-stats-96.png', size: 96, svg: 'shortcut-stats.svg' },
]

async function render(browser, svg, size, file) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}` +
      `svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`,
  )
  const png = await page.screenshot({ omitBackground: true, animations: 'disabled' })
  await page.close()
  // 读 PNG 的 IHDR 校验尺寸：产物与声明不一致时直接失败，不带病提交
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  if (width !== size || height !== size) {
    throw new Error(`${file} 应为 ${size}x${size}，实际 ${width}x${height}`)
  }
  await writeFile(path.join(outDir, file), png)
  console.log(`${file.padEnd(26)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`)
}

await mkdir(outDir, { recursive: true })
const mark = await readFile(path.join(srcDir, 'mark.svg'), 'utf8')
const browser = await chromium.launch()
try {
  for (const target of TARGETS) {
    const svg = target.svg
      ? await readFile(path.join(srcDir, target.svg), 'utf8')
      : appIcon(mark, target.mark)
    await render(browser, svg, target.size, target.file)
  }
} finally {
  await browser.close()
}
