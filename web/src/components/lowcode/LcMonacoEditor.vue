<template>
  <div ref="container" class="w-full" :style="{ height }" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

if (!self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker(_: unknown, label: string) {
      if (label === 'json') return new jsonWorker()
      return new editorWorker()
    },
  }
}

// 注册低代码内置 API 智能提示（全局只注册一次）
let _completionDispose: { dispose(): void } | null = null
function ensureCompletions() {
  if (_completionDispose) return
  _completionDispose = monaco.languages.registerCompletionItemProvider('javascript', {
    triggerCharacters: ['$', '.'],
    provideCompletionItems(model, position) {
      const word    = model.getWordUntilPosition(position)
      const range   = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
      const mk      = monaco.languages.CompletionItemKind
      const items: monaco.languages.CompletionItem[] = [
        {
          label: '$sql',
          kind:  mk.Function,
          insertText: '$sql(\'${1:SELECT * FROM table}\')',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: '执行 SQL 查询，返回结果数组',
          detail: '(query: string) => Promise<unknown>',
          range,
        },
        {
          label: '$set',
          kind:  mk.Function,
          insertText: '$set(\'${1:key}\', ${2:value})',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: '设置运行时变量',
          detail: '(key: string, val: unknown) => void',
          range,
        },
        {
          label: '$vars',
          kind:  mk.Variable,
          insertText: '$vars',
          documentation: '运行时变量 store（只读引用）',
          detail: 'Record<string, unknown>',
          range,
        },
        {
          label: '$page',
          kind:  mk.Variable,
          insertText: '$page',
          documentation: '当前页面配置对象',
          detail: 'LowCodePage',
          range,
        },
      ]
      return { suggestions: items }
    },
  })
}

const props = defineProps<{
  modelValue: string
  language?: string   // 'javascript' | 'json' | 'plaintext'
  height?: string     // 默认 '240px'
  readonly?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [val: string] }>()

const container = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

onMounted(() => {
  if (!container.value) return
  ensureCompletions()
  editor = monaco.editor.create(container.value, {
    value:            props.modelValue,
    language:         props.language ?? 'javascript',
    theme:            'vs',
    readOnly:         props.readonly ?? false,
    fontSize:         12,
    lineHeight:       20,
    minimap:          { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap:         'on',
    automaticLayout:  true,
    tabSize:          2,
    padding:          { top: 8, bottom: 8 },
    scrollbar:        { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
    overviewRulerLanes: 0,
    folding:          false,
    lineNumbersMinChars: 3,
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
