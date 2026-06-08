import { getDictItems } from '@/api/alfred'
import { READONLY_DICTS } from '@/config/dicts'
import type { DictItem } from '@/types'

export type FetchItemsFn = (() => Promise<DictItem[]>) & { clearCache?: () => void }

const LS_PREFIX = 'dict_cache:'

function wrapWithCache(key: string, ttl: number, fn: () => Promise<DictItem[]>): FetchItemsFn {
  const lsKey = LS_PREFIX + key

  const wrapped: FetchItemsFn = async () => {
    try {
      const raw = localStorage.getItem(lsKey)
      if (raw) {
        const { data, savedAt } = JSON.parse(raw) as { data: DictItem[]; savedAt: number }
        if (Date.now() - savedAt < ttl) return data
      }
    } catch { /* 缓存读取失败直接走网络 */ }

    const data = await fn()
    try {
      localStorage.setItem(lsKey, JSON.stringify({ data, savedAt: Date.now() }))
    } catch { /* 存储空间不足时忽略 */ }
    return data
  }

  wrapped.clearCache = () => {
    try { localStorage.removeItem(lsKey) } catch { /**/ }
  }

  return wrapped
}

export function makeFetchItems(key: string): FetchItemsFn {
  const ro = READONLY_DICTS.find(d => d.key === key)
  if (ro) {
    if (ro.cacheTtl) return wrapWithCache(key, ro.cacheTtl, ro.fetchItems)
    return ro.fetchItems
  }
  return () => getDictItems(key)
}
