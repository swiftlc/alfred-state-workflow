import { getDictItems } from '@/api/alfred'
import { READONLY_DICTS } from '@/config/dicts'
import type { DictItem } from '@/types'

export function makeFetchItems(key: string): () => Promise<DictItem[]> {
  const ro = READONLY_DICTS.find(d => d.key === key)
  if (ro) return ro.fetchItems
  return () => getDictItems(key)
}
