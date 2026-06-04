const BASE = 'http://127.0.0.1:8080'

interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = (await res.json()) as ApiResponse<T>
  return body.data
}

export function iGet<T>(path: string): Promise<T> {
  return request<T>(path)
}

export function iPost<T>(path: string, data: unknown = {}): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(data) })
}

export function iPatch<T>(path: string, data: unknown = {}): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(data) })
}

export function iDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}
