import request from './request'

export interface AppConfig {
  amap_key: string
}

export async function getConfig(): Promise<AppConfig> {
  const { data } = await request.get<AppConfig>('/config')
  return data
}
