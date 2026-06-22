<template>
  <div class="monaco-preview flex flex-col" :style="{ height: height }">
    <!-- 搜索栏 -->
    <div class="shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50/60">
      <n-input
        v-model:value="searchRaw"
        size="small"
        :placeholder="isJson ? 'JSON 树递归过滤（key / value）' : '按行搜索…'"
        clearable
      />
    </div>
    <!-- Monaco 编辑器 -->
    <div ref="container" class="flex-1 min-h-0" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { NInput } from 'naive-ui'

// Worker 只初始化一次
if (!self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new jsonWorker()
      return new editorWorker()
    },
  }
}

const props = defineProps<{
  content: string
  height?: string
  /** 紧凑模式：隐藏行号、禁止折叠、禁止右键菜单 */
  compact?: boolean
}>()

const container = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

const searchRaw   = ref('')
const searchQuery = ref('')
let debTimer: ReturnType<typeof setTimeout> | null = null
watch(searchRaw, (v) => {
  if (debTimer) clearTimeout(debTimer)
  debTimer = setTimeout(() => { searchQuery.value = v }, 200)
})

// ─── JSON 工具 ────────────────────────────────────────────────────────────────

function isJsonLike(s: string): boolean {
  const t = s.trim()
  return t.startsWith('{') || t.startsWith('[')
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

// 递归解包嵌套 JSON 字符串（外层是字符串 → 尝试再次解析）
function deepParse(val: unknown): unknown {
  if (typeof val === 'string' && isJsonLike(val)) {
    const inner = tryParse(val)
    if (inner !== null) return deepParse(inner)
  }
  if (Array.isArray(val)) return val.map(deepParse)
  if (val !== null && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, deepParse(v)])
    )
  }
  return val
}

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return (obj as unknown[]).map(sortKeys)
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = sortKeys((obj as Record<string, unknown>)[k])
      return acc
    }, {})
  }
  return obj
}

function filterJsonTree(obj: unknown, q: string): unknown {
  const low = q.toLowerCase()
  if (Array.isArray(obj)) {
    const arr = (obj as unknown[]).map(i => filterJsonTree(i, q)).filter(v => v !== null)
    return arr.length ? arr : null
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k.toLowerCase().includes(low)) {
        result[k] = v
      } else if (v === null || typeof v !== 'object') {
        if (String(v ?? '').toLowerCase().includes(low)) result[k] = v
      } else {
        const child = filterJsonTree(v, q)
        if (child !== null) {
          const isEmpty = Array.isArray(child)
            ? (child as unknown[]).length === 0
            : Object.keys(child as object).length === 0
          if (!isEmpty) result[k] = child
        }
      }
    }
    return Object.keys(result).length ? result : null
  }
  return null
}

// ─── 计算显示内容 ──────────────────────────────────────────────────────────────

// 原始内容（一次性解析/格式化）
const parsed = computed(() => {
  const raw = props.content
  if (!raw) return null
  if (isJsonLike(raw)) {
    const p = tryParse(raw)
    if (p !== null) return deepParse(p)
  }
  return null
})

const isJson = computed(() => parsed.value !== null)

const displayContent = computed(() => {
  const q = searchQuery.value.trim()
  if (isJson.value) {
    const obj = parsed.value
    if (!q) return JSON.stringify(sortKeys(obj), null, 2)
    const filtered = filterJsonTree(obj, q)
    if (filtered === null) return '{ }'
    return JSON.stringify(sortKeys(filtered), null, 2)
  }
  // 普通文本：按行多词交集过滤
  if (!q) return props.content
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  return props.content.split('\n').filter(l =>
    terms.every(t => l.toLowerCase().includes(t))
  ).join('\n')
})

// ─── Monaco 生命周期 ──────────────────────────────────────────────────────────

function initEditor() {
  if (!container.value || editor) return
  editor = monaco.editor.create(container.value, {
    value:                displayContent.value,
    language:             isJson.value ? 'json' : 'plaintext',
    readOnly:             true,
    automaticLayout:      true,
    minimap:              { enabled: false },
    guides:               { indentation: false, highlightActiveIndentation: false, bracketPairs: false },
    scrollBeyondLastLine: false,
    fontFamily:           '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize:             12,
    lineNumbers:          props.compact ? 'off' : 'on',
    padding:              { top: 10, bottom: 10 },
    renderOverviewRuler:  false,
    wordWrap:             'off',
    folding:              !props.compact,
    contextmenu:          !props.compact,
    ...(props.compact ? {
      lineDecorationsWidth: 4,
      scrollbar: { vertical: 'hidden' as const, horizontalScrollbarSize: 4 },
    } : {}),
  })
}

watch(displayContent, (val) => {
  if (editor) editor.setValue(val)
})

watch(() => props.content, async () => {
  await nextTick()
  if (!editor) {
    initEditor()
  } else {
    const lang = isJson.value ? 'json' : 'plaintext'
    const model = editor.getModel()
    if (model) monaco.editor.setModelLanguage(model, lang)
    editor.setValue(displayContent.value)
  }
}, { immediate: false })

// 组件挂载后由父组件调用 mount() 或 watch container
watch(container, async (el) => {
  if (el) {
    await nextTick()
    initEditor()
  }
})

onUnmounted(() => {
  editor?.dispose()
  editor = null
})
</script>

<style scoped>
.monaco-preview {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
</style>
