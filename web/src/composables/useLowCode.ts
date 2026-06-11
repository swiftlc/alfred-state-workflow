import { ref } from 'vue'
import type { LowCodePage } from '@/types/lowcode'

const LS_KEY = 'lowcode_pages'

function loadPages(): LowCodePage[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as LowCodePage[]) : []
  } catch { return [] }
}

function savePages(pages: LowCodePage[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(pages)) } catch { /* ignore */ }
}

const pages = ref<LowCodePage[]>(loadPages())

export function useLowCode() {
  function createPage(name: string): LowCodePage {
    const page: LowCodePage = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cols: 24,
      initScript: '',
      widgets: [],
    }
    pages.value = [page, ...pages.value]
    savePages(pages.value)
    return page
  }

  /** 将外部 JSON 解析出的页面插入列表（新分配 id） */
  function importPage(raw: LowCodePage): LowCodePage {
    const page: LowCodePage = {
      ...raw,
      id:        crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    pages.value = [page, ...pages.value]
    savePages(pages.value)
    return page
  }

  function deletePage(id: string) {
    pages.value = pages.value.filter(p => p.id !== id)
    savePages(pages.value)
  }

  function renamePage(id: string, name: string) {
    const page = pages.value.find(p => p.id === id)
    if (!page) return
    page.name = name
    page.updatedAt = Date.now()
    savePages(pages.value)
  }

  function savePage(page: LowCodePage) {
    const idx = pages.value.findIndex(p => p.id === page.id)
    if (idx === -1) return
    pages.value[idx] = { ...page, updatedAt: Date.now() }
    savePages(pages.value)
  }

  return { pages, createPage, importPage, deletePage, renamePage, savePage }
}
