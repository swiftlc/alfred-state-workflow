import { ref } from 'vue'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  /** AI 在此轮更新了 HTML 时，存储更新后的代码 */
  updatedHtml?: string
}

interface PlaygroundAiResponse {
  reply: string
  updatedHtml: string | null
}

export function usePlaygroundAI(getCurrentHtml: () => string) {
  const messages = ref<AiMessage[]>([])
  const loading  = ref(false)
  const error    = ref('')

  /**
   * 发送消息，返回 AI 生成的新 HTML（如有），否则返回 null
   */
  async function send(userText: string): Promise<string | null> {
    if (!userText.trim() || loading.value) return null

    messages.value.push({ role: 'user', content: userText.trim() })
    loading.value = true
    error.value   = ''

    try {
      const res = await fetch('/api/ai/playground', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          currentHtml: getCurrentHtml(),
          messages: messages.value.slice(0, -1).map(m => ({
            role:    m.role,
            content: m.updatedHtml ? `[代码已更新] ${m.content}` : m.content,
          })),
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { code: number; data: PlaygroundAiResponse; msg?: string }
      if (json.code !== 0) throw new Error(json.msg ?? 'AI 请求失败')

      const { reply, updatedHtml } = json.data
      const assistantMsg: AiMessage = {
        role:        'assistant',
        content:     reply || (updatedHtml ? '已根据你的需求更新代码 ✓' : ''),
        updatedHtml: updatedHtml ?? undefined,
      }
      messages.value.push(assistantMsg)
      return updatedHtml
    } catch (e) {
      error.value = (e as Error).message || 'AI 请求失败'
      messages.value.push({ role: 'assistant', content: `❌ ${error.value}` })
      return null
    } finally {
      loading.value = false
    }
  }

  function clear() {
    messages.value = []
    error.value    = ''
  }

  return { messages, loading, error, send, clear }
}
