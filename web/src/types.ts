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
  isDefault?: boolean
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

export interface SensingContext {
  key: string
  value: { name: string; value: string | Record<string, unknown> }
  confidence: number
}

export interface SnapshotSummary {
  id: string
  contentType: string
  contentPreview: string
  overallStatus: 'parsing' | 'done' | 'interrupted'
  currentStage: string | null
  finalConfidence: number
  finalResult: { contexts: SensingContext[]; suggestions: string[] } | null
  createdAt: number
  completedAt: number | null
  dismissed: boolean
}

export interface SnapshotStage {
  name: string
  status: 'running' | 'done' | 'interrupted' | 'error'
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  result: { contexts: SensingContext[]; suggestions: string[] } | null
  error: string | null
}

export interface SnapshotDetail {
  id: string
  changeEvent: { source: string; content: string; contentType: string; changedAt: number }
  stages: SnapshotStage[]
  currentStage: string | null
  overallStatus: 'parsing' | 'done' | 'interrupted'
  finalResult: { contexts: SensingContext[]; suggestions: string[] } | null
  finalConfidence: number
  contentPreview: string
  dismissed: boolean
  createdAt: number
  completedAt: number | null
}

export interface Task {
  id: string
  name: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  progress: number
  message?: string
  completedAt?: number
}
