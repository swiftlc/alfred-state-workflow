export async function proxyGet<T>(url: string, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch('/proxy', { headers: { 'x-proxy-dest': url, ...extraHeaders } })
  return res.json()
}

export async function proxyPost<T>(url: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch('/proxy', {
    method: 'POST',
    headers: { 'x-proxy-dest': url, 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  })
  return res.json()
}
