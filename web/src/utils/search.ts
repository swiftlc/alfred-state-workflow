// @ts-ignore
import pinyinMatch from 'pinyin-match'

export function matchQuery(query: string, ...targets: (string | undefined | null)[]): boolean {
  if (!query) return true
  const terms = query.split(/\s+/).filter(t => t.trim() !== '')
  if (terms.length === 0) return true
  const validTargets = targets.filter((t): t is string => t != null && t !== '')
  if (validTargets.length === 0) return false
  return terms.every(term =>
    validTargets.some(target =>
      target.toLowerCase().includes(term.toLowerCase()) || pinyinMatch.match(target, term)
    )
  )
}

export function formatTime(ts: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000)        return '刚刚'
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
