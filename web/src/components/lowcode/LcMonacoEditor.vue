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
