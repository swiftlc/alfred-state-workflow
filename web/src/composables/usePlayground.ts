import { ref } from 'vue'
import type { PlaygroundPage } from '@/types/playground'
import { DEMO_PAGE_HTML, DEMO_PAGE_NAME, DEMO_PAGE_PROMPT } from '@/components/playground/demoPage'
import { SALE_STATUS_PAGE_HTML, SALE_STATUS_PAGE_NAME, SALE_STATUS_PAGE_PROMPT } from '@/components/playground/saleStatusPage'

// 每个 page 用独立 key，互不干扰
const INDEX_KEY = 'pg_index'   // 存 id 列表（有序）

function readIndex(): string[] {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') } catch { return [] }
}

function writeIndex(ids: string[]) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
}

function pageKey(id: string) { return `pg_page_${id}` }

function readPage(id: string): PlaygroundPage | null {
  try {
    const raw = localStorage.getItem(pageKey(id))
    return raw ? (JSON.parse(raw) as PlaygroundPage) : null
  } catch { return null }
}

function writePage(page: PlaygroundPage) {
  try { localStorage.setItem(pageKey(page.id), JSON.stringify(page)) } catch { /* ignore */ }
}

function removePage(id: string) {
  try { localStorage.removeItem(pageKey(id)) } catch { /* ignore */ }
}

// 模块级响应式列表
const _stored = readIndex().map(id => readPage(id)).filter((p): p is PlaygroundPage => p !== null)

// 首次无页面时注入内置 demo
if (_stored.length === 0) {
  const builtins: PlaygroundPage[] = [
    { id: 'demo-sale-status', name: SALE_STATUS_PAGE_NAME, html: SALE_STATUS_PAGE_HTML, prompt: SALE_STATUS_PAGE_PROMPT, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'demo-sql-query',   name: DEMO_PAGE_NAME,        html: DEMO_PAGE_HTML,        prompt: DEMO_PAGE_PROMPT,        createdAt: Date.now(), updatedAt: Date.now() },
  ]
  writeIndex(builtins.map(p => p.id))
  builtins.forEach(p => { writePage(p); _stored.push(p) })
}

const pages = ref<PlaygroundPage[]>(_stored)

export function usePlayground() {
  function createPage(name: string, html = '', prompt = ''): PlaygroundPage {
    const page: PlaygroundPage = {
      id: crypto.randomUUID(),
      name,
      html,
      prompt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    pages.value = [page, ...pages.value]
    writeIndex(pages.value.map(p => p.id))
    writePage(page)
    return page
  }

  function savePage(page: PlaygroundPage) {
    const updated = { ...page, updatedAt: Date.now() }
    const idx = pages.value.findIndex(p => p.id === page.id)
    if (idx !== -1) pages.value[idx] = updated
    else pages.value = [updated, ...pages.value]
    writeIndex(pages.value.map(p => p.id))
    writePage(updated)
    return updated
  }

  function deletePage(id: string) {
    pages.value = pages.value.filter(p => p.id !== id)
    writeIndex(pages.value.map(p => p.id))
    removePage(id)
  }

  function renamePage(id: string, name: string) {
    const page = pages.value.find(p => p.id === id)
    if (!page) return
    const updated = { ...page, name, updatedAt: Date.now() }
    pages.value = pages.value.map(p => p.id === id ? updated : p)
    writePage(updated)
  }

  /** 读取完整 page（含 html），因为 pages ref 里的 html 可能被替换成空节省内存 */
  function getPage(id: string): PlaygroundPage | null {
    return readPage(id)
  }

  /** 导入外部 JSON（重新分配 id） */
  function importPage(raw: PlaygroundPage): PlaygroundPage {
    return createPage(raw.name + '（导入）', raw.html, raw.prompt)
  }

  return { pages, createPage, savePage, deletePage, renamePage, getPage, importPage }
}
