// axios 模块增强：自定义请求元数据。meta.silent 标记的失败由视图层
// 汇总提示，响应拦截器不再逐请求弹 toast（见 api/request.ts）。
// 必须放在带 import 的模块文件里，否则会遮蔽 axios 自带类型。
import 'axios'

declare module 'axios' {
  export interface AxiosRequestConfig {
    meta?: { silent?: boolean }
  }
}
