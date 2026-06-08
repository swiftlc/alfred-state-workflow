import type { DictItem } from '@/types'

// ─── 与 alfred-workflow constants.ts 保持一致 ────────────────────────────────
const MIS_USERNAME  = 'liucheng58'
const OCTO_BASE_URL = 'https://octo.mws-test.sankuai.com'
const MAFKA_BASE_URL = 'https://mafka.mws-test.sankuai.com'

async function proxyGet<T>(destUrl: string, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch('/proxy', {
    headers: { 'x-proxy-dest': destUrl, ...extraHeaders },
  })
  return res.json()
}

export interface ReadonlyDictConfig {
  key:        string
  name:       string
  fetchItems: () => Promise<DictItem[]>
  cacheTtl?:  number  // 毫秒，不传则不缓存
}

export const READONLY_DICTS: ReadonlyDictConfig[] = [
  {
    key:      'appkey',
    name:     'Appkey',
    cacheTtl: 7 * 24 * 60 * 60 * 1000,
    fetchItems: async () => {
      const data = await proxyGet<{ success: boolean; data: string[] }>(
        `${OCTO_BASE_URL}/api/octo/v2/common/apps?mis=${MIS_USERNAME}`
      )
      if (data?.success && Array.isArray(data.data)) {
        return data.data.map(a => ({ id: a, name: a, value: a, description: '', pinned: false, lastUsedAt: 0 }))
      }
      return []
    },
  },
  {
    key:      'kafka_topic',
    name:     'Kafka Topic',
    cacheTtl: 24 * 60 * 60 * 1000,
    fetchItems: async () => {
      const data = await proxyGet<{
        code: number
        data: { list: Array<{ id: number; name: string; remark: string | null; status: number }> }
      }>(
        `${MAFKA_BASE_URL}/mafka/restful/topic/list?pageNum=1&limit=1000&type=3&content=&auth=2`,
        { 'm-appkey': 'fe_mafka-fe' }
      )
      if (data?.code === 0 && Array.isArray(data.data?.list)) {
        return data.data.list
          .filter(t => t.status === 1)
          .map(t => ({
            id:          String(t.id),
            name:        t.remark || t.name,
            value:       t.name,
            description: t.name,
            pinned:      false,
            lastUsedAt:  0,
          }))
      }
      return []
    },
  },
]
