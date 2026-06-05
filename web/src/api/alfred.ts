import type { DictMeta, DictItem, HistoryItem, Workspace, Alias, Task } from '@/types'

const BASE = '/api/alfred'

interface ApiResponse<T> { code: number; data: T; msg?: string }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
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

// ─── Workspaces ───────────────────────────────────────────────────────────────
export const getWorkspaces   = ()           => get<Workspace[]>('/workspaces')
export const deleteWorkspace = (id: string) => del<null>(`/workspaces/${id}`)

// ─── Aliases ──────────────────────────────────────────────────────────────────
export const getAliases  = ()           => get<Alias[]>('/aliases')
export const deleteAlias = (id: string) => del<null>(`/aliases/${id}`)

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const getTasks = () => get<Task[]>('/tasks')

// ─── Applogs ──────────────────────────────────────────────────────────────────
export const getApplogs  = (lines = 200) => get<string[]>(`/applogs?lines=${lines}`)
export const clearApplogs = ()           => del<null>('/applogs')
