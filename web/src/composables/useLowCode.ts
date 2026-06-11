import { ref } from 'vue'
import type { LowCodePage, Widget } from '@/types/lowcode'

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

  function addWidget(pageId: string, widget: Widget) {
    const page = pages.value.find(p => p.id === pageId)
    if (!page) return
    page.widgets = [...page.widgets, widget]
    page.updatedAt = Date.now()
    savePages(pages.value)
  }

  function updateWidget(pageId: string, widget: Widget) {
    const page = pages.value.find(p => p.id === pageId)
    if (!page) return
    page.widgets = page.widgets.map(w => w.id === widget.id ? widget : w)
    page.updatedAt = Date.now()
    savePages(pages.value)
  }

  function removeWidget(pageId: string, widgetId: string) {
    const page = pages.value.find(p => p.id === pageId)
    if (!page) return
    page.widgets = page.widgets.filter(w => w.id !== widgetId)
    page.updatedAt = Date.now()
    savePages(pages.value)
  }

  return { pages, createPage, deletePage, renamePage, savePage, addWidget, updateWidget, removeWidget }
}
