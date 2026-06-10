// alfred-workflow/web/src/composables/useOctoHistory.ts
import { computed, ref } from 'vue'

const LS_KEY = 'octo_history'
const MAX_ENTRIES = 50

export interface OctoHistoryEntry {
  id: string
  savedAt: number
  note: string
  tags: string[]
  // 调用快照（node 不持久化，因节点随时变化）
  appkey: string
  swimlane?: string     // 泳道偏好，恢复时驱动节点选择
  serviceName: string
  methodKey: string     // 含签名，如 "submitTask(Req):Resp"
  methodName: string    // 仅方法名
  paramTypes: string[]
  paramValues: string[]
  // 结果快照
  result: unknown
  invokeMs: number | null
  success: boolean
}

// 模块级单例，所有组件共享同一份响应式状态
const entries = ref<OctoHistoryEntry[]>([])
let initialized = false

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) entries.value = parsed as OctoHistoryEntry[]
    }
  } catch {
    entries.value = []
  }
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries.value))
  } catch { /* ignore */ }
}

export function useOctoHistory() {
  if (!initialized) {
    load()
    initialized = true
  }

  function save(
    snapshot: Omit<OctoHistoryEntry, 'id' | 'savedAt' | 'note' | 'tags'>,
    note = '',
    tags: string[] = [],
  ): string {
    const entry: OctoHistoryEntry = {
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      note,
      tags,
      ...snapshot,
    }
    entries.value.unshift(entry)
    if (entries.value.length > MAX_ENTRIES) entries.value.pop()
    persist()
    return entry.id
  }

  function remove(id: string) {
    entries.value = entries.value.filter(e => e.id !== id)
    persist()
  }

  function clear() {
    entries.value = []
    persist()
  }

  function updateNote(id: string, note: string, tags: string[]) {
    const entry = entries.value.find(e => e.id === id)
    if (entry) {
      entry.note = note
      entry.tags = tags
      persist()
    }
  }

  const allTags = computed((): string[] => {
    const set = new Set<string>()
    entries.value.forEach(e => e.tags.forEach(t => set.add(t)))
    return Array.from(set).sort()
  })

  return { entries, allTags, save, remove, clear, updateNote }
}
