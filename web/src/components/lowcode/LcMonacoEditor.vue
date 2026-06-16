<template>
  <div ref="container" class="w-full" :style="{ height }" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker   from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker     from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

if (!self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker(_: unknown, label: string) {
      if (label === 'json')                          return new jsonWorker()
      if (label === 'typescript' || label === 'javascript') return new tsWorker()
      return new editorWorker()
    },
  }
}

// ─── 低代码 API 补全（javascript 语言，全局只注册一次） ─────────────────────────
let _lcCompletionDispose: { dispose(): void } | null = null
function ensureCompletions() {
  if (_lcCompletionDispose) return
  _lcCompletionDispose = monaco.languages.registerCompletionItemProvider('javascript', {
    triggerCharacters: ['$', '.'],
    provideCompletionItems(model, position) {
      const word  = model.getWordUntilPosition(position)
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
      const mk    = monaco.languages.CompletionItemKind
      const items: monaco.languages.CompletionItem[] = [
        { label: '$sql',  kind: mk.Function, insertText: '$sql(\'${1:SELECT * FROM table}\')', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '执行 SQL 查询，返回结果数组', detail: '(query: string) => Promise<Row[]>', range },
        { label: '$set',  kind: mk.Function, insertText: '$set(\'${1:key}\', ${2:value})',     insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: '设置运行时变量', detail: '(key: string, val: unknown) => void', range },
        { label: '$vars', kind: mk.Variable, insertText: '$vars', documentation: '运行时变量 store（只读引用）', detail: 'Record<string, unknown>', range },
        { label: '$page', kind: mk.Variable, insertText: '$page', documentation: '当前页面配置对象', detail: 'LowCodePage', range },
      ]
      return { suggestions: items }
    },
  })
}

// ─── Playground API 补全（html + javascript 语言，全局只注册一次） ──────────────
let _pgCompletionDisposed = false
function ensurePlaygroundCompletions() {
  if (_pgCompletionDisposed) return
  _pgCompletionDisposed = true

  const mk = monaco.languages.CompletionItemKind
  const IR = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet

  function pgItems(range: monaco.IRange): monaco.languages.CompletionItem[] {
    return [
      {
        label: '$sql',
        kind:  mk.Function,
        insertText: "await $sql('${1:SELECT * FROM table}')",
        insertTextRules: IR,
        documentation: '执行 SQL 查询，返回结果行数组\n返回: Row[]',
        detail: '(query: string) => Promise<Row[]>',
        range,
      },
      {
        label: '$http',
        kind:  mk.Function,
        insertText: "await $http('${1:/api/path}', { method: '${2:GET}' })",
        insertTextRules: IR,
        documentation: 'HTTP 请求\n• /api/* → 本地直连\n• 外部 URL → 走代理转发',
        detail: '(url: string, options?: { method, body, headers }) => Promise<any>',
        range,
      },
      {
        label: '$octo',
        kind:  mk.Function,
        insertText: "await $octo({\n  appKey: '${1:com.xxx}',\n  serviceName: '${2:ServiceName}',\n  methodName: '${3:methodName}',\n  methodParams: [${4}]\n})",
        insertTextRules: IR,
        documentation: '调用 Octo RPC 服务',
        detail: '(body: OctoRequest) => Promise<any>',
        range,
      },
      {
        label: '$ctx',
        kind:  mk.Function,
        insertText: 'await $ctx()',
        insertTextRules: IR,
        documentation: '获取当前 Alfred 上下文\n返回 { state, data: { tenant, swimlane, appkey, ... } }',
        detail: '() => Promise<AlfredContext | null>',
        range,
      },
      {
        label: '$openUrl',
        kind:  mk.Function,
        insertText: "$openUrl('${1:https://}')",
        insertTextRules: IR,
        documentation: '在新标签页打开 URL',
        detail: '(url: string) => void',
        range,
      },
      {
        label: '$pg',
        kind:  mk.Variable,
        insertText: '$pg',
        documentation: 'Playground 全局 API 集合\n{ sql, http, octo, ctx, openUrl }',
        detail: '{ sql, http, octo, ctx, openUrl }',
        range,
      },
    ]
  }

  for (const lang of ['javascript', 'html'] as const) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['$', '.'],
      provideCompletionItems(model, position) {
        const word  = model.getWordUntilPosition(position)
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
        return { suggestions: pgItems(range) }
      },
    })
  }
}

const props = defineProps<{
  modelValue: string
  language?: string   // 'javascript' | 'html' | 'json' | 'plaintext'
  height?: string     // 默认 '240px'
  readonly?: boolean
  /** 'lowcode'（默认）注册 $set/$vars/$page；'playground' 注册 $sql/$http/$octo/$ctx/$openUrl */
  context?: 'lowcode' | 'playground'
}>()

const emit = defineEmits<{ 'update:modelValue': [val: string] }>()

const container = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

onMounted(() => {
  if (!container.value) return
  if (props.context === 'playground') ensurePlaygroundCompletions()
  else ensureCompletions()

  const isPlayground = props.context === 'playground'
  editor = monaco.editor.create(container.value, {
    value:            props.modelValue,
    language:         props.language ?? 'javascript',
    theme:            'vs',
    readOnly:         props.readonly ?? false,
    fontSize:         isPlayground ? 13 : 12,
    lineHeight:       isPlayground ? 22 : 20,
    minimap:          { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap:         'on',
    automaticLayout:  true,
    tabSize:          2,
    padding:          { top: 8, bottom: 8 },
    scrollbar:        { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
    overviewRulerLanes: 0,
    folding:          isPlayground,
    lineNumbersMinChars: 3,
    formatOnPaste:    isPlayground,
  })

  editor.onDidChangeModelContent(() => {
    const val = editor?.getValue() ?? ''
    if (val !== props.modelValue) emit('update:modelValue', val)
  })
})

// 外部 modelValue 变化时同步到编辑器（避免光标跳位）
watch(() => props.modelValue, (val) => {
  if (editor && editor.getValue() !== val) {
    editor.setValue(val)
  }
})

watch(() => props.language, (lang) => {
  if (editor && lang) {
    const model = editor.getModel()
    if (model) monaco.editor.setModelLanguage(model, lang)
  }
})

onUnmounted(() => {
  editor?.dispose()
  editor = null
})
</script>
