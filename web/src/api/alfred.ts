import type { DictMeta, DictItem, HistoryItem, Workspace, Alias, Task, Context, SnapshotSummary, SnapshotDetail } from '@/types'

const BASE = '/api/alfred'

interface ApiResponse<T> { code: number; data: T; msg?: string }

async function internalRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let res: Response
  try {
    res = await fetch(`/internal${path}`, {
      method,
      signal: controller.signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('请求超时，请稍后重试')
    throw new Error(`网络错误：${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json: ApiResponse<T> = await res.json()
  if (json.code !== 0) throw new Error(json.msg ?? `API error ${json.code}`)
  return json.data
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('请求超时，请稍后重试')
    throw new Error(`网络错误：${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json: ApiResponse<T> = await res.json()
  if (json.code !== 0) throw new Error(json.msg ?? `API error ${json.code}`)
  return json.data
}

const get  = <T>(path: string)                  => request<T>('GET',    path)
const post = <T>(path: string, body: unknown)   => request<T>('POST',   path, body)
const put  = <T>(path: string, body: unknown)   => request<T>('PUT',    path, body)
const del  = <T>(path: string)                  => request<T>('DELETE', path)

// ─── Dicts ────────────────────────────────────────────────────────────────────
export const getDicts       = ()                    => get<DictMeta[]>('/dicts')
export const getDictItems   = (key: string)         => get<DictItem[]>(`/dicts/${key}/items`)
export const createDictItem = (key: string, body: { name: string; value?: string; description?: string }) =>
  post<{ id: string }>(`/dicts/${key}/items`, body)
export const updateDictItem = (key: string, id: string, body: Partial<{ name: string; value: string; description: string }>) =>
  put<null>(`/dicts/${key}/items/${id}`, body)
export const deleteDictItem = (key: string, id: string) => del<null>(`/dicts/${key}/items/${id}`)
export const toggleDictPin  = (key: string) => post<{ pinned: boolean }>('/dict-meta/pin', { key })
export const getDictMeta    = (key: string) => get<Record<string, { pinned: boolean; lastUsedAt: number; description: string }>>(`/dict-meta/${key}/items`)
export const updateDictItemDescription = (itemKey: string, description: string) =>
  put<null>('/dict-meta/description', { key: itemKey, description })

// ─── History ──────────────────────────────────────────────────────────────────
export const getHistory       = ()           => get<HistoryItem[]>('/history')
export const deleteHistory    = (id: string) => del<null>(`/history/${id}`)
export const clearHistory     = ()           => del<null>('/history')
export const toggleHistoryPin = (id: string) => post<null>(`/history/${id}/pin`, {})
export const renameHistory    = (id: string, title: string, subtitle?: string) =>
  request<null>('PATCH', `/history/${id}`, { title, subtitle })
export const patchHistoryData = (id: string, data: Record<string, unknown>) =>
  request<null>('PATCH', `/history/${id}`, { data })

// ─── Workspaces ───────────────────────────────────────────────────────────────
export const getWorkspaces       = ()                                         => get<Workspace[]>('/workspaces')
export const deleteWorkspace     = (id: string)                               => del<null>(`/workspaces/${id}`)
export const patchWorkspaceData  = (id: string, data: Record<string, unknown>) =>
  request<null>('PATCH', `/workspaces/${id}`, { data })
export const renameWorkspace     = (id: string, name: string) =>
  request<null>('PATCH', `/workspaces/${id}`, { name })
export const createWorkspace      = (name: string, data: Record<string, unknown>) => post<{ id: string }>('/workspaces', { name, data })
export const setDefaultWorkspace  = (id: string) => post<{ isDefault: boolean }>(`/workspaces/${id}/default`, {})

// ─── Aliases ──────────────────────────────────────────────────────────────────
export const getAliases   = ()           => get<Alias[]>('/aliases')
export const deleteAlias  = (id: string) => del<null>(`/aliases/${id}`)
export const patchAliasData = (id: string, data: Record<string, unknown>) =>
  request<null>('PATCH', `/aliases/${id}`, { data })
export const renameAlias  = (id: string, fields: { alias?: string; title?: string; subtitle?: string }) =>
  request<null>('PATCH', `/aliases/${id}`, fields)
export const createAlias  = (body: { alias: string; action: string; data: Record<string, unknown>; title: string; subtitle?: string }) =>
  post<{ id: string }>('/aliases', body)

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const getTasks = () => get<Task[]>('/tasks')

// ─── Applogs ──────────────────────────────────────────────────────────────────
export const getApplogs  = (lines = 200) => get<string[]>(`/applogs?lines=${lines}`)
export const clearApplogs = ()           => del<null>('/applogs')

// ─── Context (/internal/context) ─────────────────────────────────────────────
export const getContext = () => internalRequest<Context | null>('GET', '/context')
export const setContext = (ctx: Context) => internalRequest<null>('POST', '/context', ctx)

// ─── Sensing (/api/sensing) ───────────────────────────────────────────────────
async function sensingFetch<T>(path: string, method = 'GET'): Promise<T> {
  const res = await fetch(`/api/sensing${path}`, { method })
  const json = await res.json()
  if (Array.isArray(json)) return json as T           // history 端点返回裸数组
  if (json.code !== 0) throw new Error(json.msg ?? `sensing API error`)
  return json.data
}

export const getSensingStatus   = () => sensingFetch<Record<string, SnapshotSummary | null>>('/status')
export const getSensingHistory  = (source: string, limit = 20) =>
  sensingFetch<SnapshotSummary[]>(`/history/${source}?limit=${limit}`)
export const getSensingSnapshot = (id: string) => sensingFetch<SnapshotDetail>(`/snapshot/${id}`)
export const dismissSensing     = (source: string) =>
  sensingFetch<{ dismissed: boolean }>(`/dismiss/${source}`, 'POST')
export const triggerSensingAI   = (id: string) =>
  sensingFetch<{ message: string }>(`/trigger-ai/${id}`, 'POST')
