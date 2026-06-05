export interface DictMeta {
  key: string
  name: string
}

export interface DictItem {
  id: string
  name: string
  value: string
  description: string
  pinned: boolean
  lastUsedAt: number
}

export interface HistoryItem {
  id: string
  title: string
  subtitle?: string
  action: string
  data: Record<string, unknown>
  copyValue?: string
  copyName?: string
  copyKey?: string
  timestamp: number
  isPinned: boolean
}

export interface Workspace {
  id: string
  name: string
  data: Record<string, unknown>
  createdAt: number
  lastUsedAt: number
  usageCount: number
}

export interface Alias {
  id: string
  alias: string
  action: string
  data: Record<string, unknown>
  title: string
  subtitle?: string
  createdAt: number
  lastUsedAt: number
  usageCount: number
}

export interface ContextDataItem {
  id: string
  name: string
  value: string
  description?: string
}

export interface Context {
  state: string
  data: Record<string, ContextDataItem>
}

export interface Task {
  id: string
  name: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  progress: number
  message?: string
  completedAt?: number
}
