<template>
  <n-modal :show="show" @update:show="$emit('update:show', $event)" style="width: 92vw; max-width: 1400px">
    <div class="bg-white rounded-xl overflow-hidden flex flex-col" style="height: 82vh">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 shrink-0">
        <span class="text-xs font-medium font-mono text-slate-500 truncate max-w-[60%]" :title="configKey">
          {{ configKey }}
        </span>
        <n-button size="tiny" @click="$emit('update:show', false)">关闭</n-button>
      </div>

      <!-- 环境标签栏 + 复制按钮 -->
      <div class="grid shrink-0" style="grid-template-columns: 1fr 1fr; gap: 1px; background: #f1f5f9">
        <div class="flex items-center justify-between px-3 py-1.5 bg-white">
          <span class="text-[11px] font-semibold text-blue-500 uppercase tracking-wide">Test</span>
          <n-button size="tiny" ghost :disabled="testValue === null" @click="copyVal(testValue, 'Test')">
            复制
          </n-button>
        </div>
        <div class="flex items-center justify-between px-3 py-1.5 bg-white">
          <span class="text-[11px] font-semibold text-purple-500 uppercase tracking-wide">Prod</span>
          <n-button size="tiny" ghost :disabled="prodValue === null" @click="copyVal(prodValue, 'Prod')">
            复制
          </n-button>
        </div>
      </div>

      <!-- 搜索栏 -->
      <div class="px-3 py-2 border-b border-slate-100 shrink-0 bg-slate-50/60">
        <n-input
          v-model:value="searchRaw"
          size="small"
          placeholder="搜索 key / value…  JSON 树递归过滤，普通文本按行过滤"
          clearable
        />
      </div>

      <!-- Monaco Diff Editor -->
      <div ref="editorContainer" class="flex-1 min-h-0" />
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { NModal, NButton, NInput, useMessage } from 'naive-ui'

// ─── Worker 配置（全局只设一次）──────────────────────────────────────────────────

if (!self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new jsonWorker()
      return new editorWorker()
    },
  }
}

const props = defineProps<{
  show: boolean
  configKey: string
  testValue: string | null
  prodValue: string | null
}>()

const emit = defineEmits<{ 'update:show': [val: boolean] }>()

const message         = useMessage()
const editorContainer = ref<HTMLElement | null>(null)
let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null

// ─── 搜索状态（防抖 200ms）─────────────────────────────────────────────────────

const searchRaw   = ref('')
const searchQuery = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchRaw, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { searchQuery.value = val }, 200)
})

// ─── JSON 工具 ────────────────────────────────────────────────────────────────

function isJsonLike(val: string | null): boolean {
  if (!val) return false
  const t = val.trim()
  return t.startsWith('{') || t.startsWith('[')
}

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys)
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = sortKeys((obj as Record<string, unknown>)[k])
      return acc
    }, {})
  }
  return obj
}

function tryFormat(val: string | null): string {
  if (val === null) return ''
  try { return JSON.stringify(sortKeys(JSON.parse(val)), null, 2) } catch { return val }
}

// ─── JSON 树递归过滤 ──────────────────────────────────────────────────────────
// 规则：key 包含 q → 保留整个子树；leaf value 包含 q → 保留；
//       嵌套对象/数组 → 递归过滤，有非空结果才保留

function filterJsonTree(obj: unknown, q: string): unknown {
  const qLow = q.toLowerCase()

  if (Array.isArray(obj)) {
    const arr = (obj as unknown[]).map(item => filterJsonTree(item, q)).filter(v => v !== null)
    return arr.length ? arr : null
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k.toLowerCase().includes(qLow)) {
        // key 匹配 → 保留整个值（不再裁剪子树）
        result[k] = v
      } else if (v === null || typeof v !== 'object') {
        // 叶子值匹配
        if (String(v ?? '').toLowerCase().includes(qLow)) result[k] = v
      } else {
        // 递归子树
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

// ─── 按搜索词处理显示内容 ──────────────────────────────────────────────────────

function applySearch(val: string | null): string {
  const q = searchQuery.value.trim()
  if (!q) return tryFormat(val)
  if (val === null) return ''

  if (isJsonLike(val)) {
    try {
      const parsed = JSON.parse(val)
      if (typeof parsed === 'object' && parsed !== null) {
        const filtered = filterJsonTree(parsed, q)
        if (filtered === null) return '{ }'
        return JSON.stringify(sortKeys(filtered), null, 2)
      }
    } catch { /* fall through to line filter */ }
  }

  // 普通文本：按行过滤（多词交集）
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  return val.split('\n').filter(line =>
    terms.every(t => line.toLowerCase().includes(t))
  ).join('\n')
}

// ─── Monaco Editor 生命周期 ───────────────────────────────────────────────────

function getLanguage() {
  return isJsonLike(props.testValue ?? props.prodValue) ? 'json' : 'plaintext'
}

function createOrUpdateEditor() {
  if (!editorContainer.value) return
  const testStr = applySearch(props.testValue)
  const prodStr = applySearch(props.prodValue)
  const lang    = getLanguage()

  if (diffEditor) {
    const model = diffEditor.getModel()
    if (model) {
      model.original.setValue(testStr)
      model.modified.setValue(prodStr)
    }
    return
  }

  diffEditor = monaco.editor.createDiffEditor(editorContainer.value, {
    readOnly:                true,
    enableSplitViewResizing: true,
    automaticLayout:         true,
    minimap:                 { enabled: false },
    scrollBeyondLastLine:    false,
    renderSideBySide:        true,
    fontFamily:              '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize:                12,
    lineNumbers:             'on',
    padding:                 { top: 10, bottom: 10 },
    renderOverviewRuler:     false,
    originalEditable:        false,
    diffAlgorithm:           'advanced',
  })

  diffEditor.setModel({
    original: monaco.editor.createModel(testStr, lang),
    modified: monaco.editor.createModel(prodStr, lang),
  })
}

watch(() => props.show, async (v) => {
  if (v) {
    await nextTick()
    setTimeout(createOrUpdateEditor, 80)
  } else {
    // 关闭时重置搜索 + dispose editor
    searchRaw.value   = ''
    searchQuery.value = ''
    diffEditor?.dispose()
    diffEditor = null
  }
})

// 搜索词变化时同步更新 Monaco 模型
watch(searchQuery, () => {
  if (!props.show || !diffEditor) return
  const model = diffEditor.getModel()
  if (model) {
    model.original.setValue(applySearch(props.testValue))
    model.modified.setValue(applySearch(props.prodValue))
  }
})

onUnmounted(() => {
  diffEditor?.dispose()
  diffEditor = null
})

// ─── 复制 ─────────────────────────────────────────────────────────────────────

function copyVal(val: string | null, label: string) {
  if (val === null) return
  navigator.clipboard.writeText(val)
  message.success(`已复制 ${label} 值`)
}
</script>
