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
  query?: string
  createdAt: number
  pinned?: boolean
}

export interface Workspace {
  id: string
  name: string
  data: Record<string, unknown>
  createdAt: number
  usedAt?: number
}

export interface Alias {
  id: string
  name: string
  action: string
  createdAt: number
  usedAt?: number
}

export interface Task {
  id: string
  name: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  progress: number
  message?: string
  completedAt?: number
}
