// alfred-workflow/web/src/composables/useOctoHistory.ts
import { ref, computed } from 'vue'

const LS_KEY = 'octo_history'
const PANEL_KEY = 'octo_history_panel_open'
const MAX_ENTRIES = 50

export interface OctoHistoryNode {
  ip: string
  port: number
  name: string
  version?: string
  swimlane?: string
  cell?: string
}

export interface OctoHistoryEntry {
  id: string
  savedAt: number
  note: string
  tags: string[]
  pinned: boolean
  // 调用快照
  appkey: string
  node: OctoHistoryNode
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
const panelOpen = ref<boolean>(false)
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
  try {
    const p = localStorage.getItem(PANEL_KEY)
    if (p !== null) panelOpen.value = p === 'true'
  } catch { /* ignore */ }
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries.value))
  } catch { /* ignore */ }
}

function persistPanel() {
  try {
    localStorage.setItem(PANEL_KEY, String(panelOpen.value))
  } catch { /* ignore */ }
}

export function useOctoHistory() {
  if (!initialized) {
    load()
    initialized = true
  }

  function save(
    snapshot: Omit<OctoHistoryEntry, 'id' | 'savedAt' | 'note' | 'tags' | 'pinned'>,
    note = '',
    tags: string[] = [],
  ): string | null {
    const entry: OctoHistoryEntry = {
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      note,
      tags,
      pinned: false,
      ...snapshot,
    }
    entries.value.unshift(entry)
    // 超出上限：淘汰最旧的非置顶条目；全部置顶时拒绝本次插入
    if (entries.value.length > MAX_ENTRIES) {
      const idx = entries.value.findLastIndex(e => !e.pinned)
      if (idx !== -1) {
        entries.value.splice(idx, 1)
      } else {
        entries.value.shift()
        return null
      }
    }
    persist()
    return entry.id
  }

  function remove(id: string) {
    entries.value = entries.value.filter(e => e.id !== id)
    persist()
  }

  function clear() {
    entries.value = entries.value.filter(e => e.pinned)
    persist()
  }

  function togglePin(id: string) {
    const entry = entries.value.find(e => e.id === id)
    if (entry) {
      entry.pinned = !entry.pinned
      persist()
    }
  }

  function updateNote(id: string, note: string, tags: string[]) {
    const entry = entries.value.find(e => e.id === id)
    if (entry) {
      entry.note = note
      entry.tags = tags
      persist()
    }
  }

  function togglePanel() {
    panelOpen.value = !panelOpen.value
    persistPanel()
  }

  const allTags = computed((): string[] => {
    const set = new Set<string>()
    entries.value.forEach(e => e.tags.forEach(t => set.add(t)))
    return Array.from(set).sort()
  })

  return { entries, panelOpen, allTags, save, remove, clear, togglePin, updateNote, togglePanel }
}
