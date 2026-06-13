/// <reference types="vite/client" />

declare module 'element-plus/dist/locale/zh-cn.mjs' {
  const zhCn: any
  export default zhCn
}

declare module '@amap/amap-jsapi-loader' {
  const AMapLoader: {
    load: (options: { key: string; version: string; plugins?: string[] }) => Promise<any>
  }
  export default AMapLoader
}

declare module 'markdown-it' {
  class MarkdownIt {
    constructor(options?: any)
    render(src: string): string
  }
  export default MarkdownIt
}
