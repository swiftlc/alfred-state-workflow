<template>
  <div
    class="relative w-full h-full"
    :style="{
      display: 'grid',
      gridTemplateColumns: `repeat(${page.cols}, 1fr)`,
      gridAutoRows: '40px',
      gap: '0',
    }"
  >
    <div
      v-for="w in page.widgets"
      :key="w.id"
      :style="{
        gridColumn: `${w.pos.col} / span ${w.pos.w}`,
        gridRow:    `${w.pos.row} / span ${w.pos.h}`,
      }"
    >
      <component
        :is="widgetComponent(w.type)"
        :widget="w"
        :runtime="runtime"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, defineAsyncComponent } from 'vue'
import type { LowCodePage, RuntimeContext, WidgetType } from '@/types/lowcode'

const WIDGET_COMPONENTS = {
  label:  defineAsyncComponent(() => import('./widgets/LcLabel.vue')),
  input:  defineAsyncComponent(() => import('./widgets/LcInput.vue')),
  button: defineAsyncComponent(() => import('./widgets/LcButton.vue')),
  table:  defineAsyncComponent(() => import('./widgets/LcTable.vue')),
}

const props = defineProps<{ page: LowCodePage }>()

const vars = reactive<Record<string, unknown>>({})

function setVar(key: string, val: unknown) { vars[key] = val }

async function runScript(code: string) {
  const fn = new Function(
    '$sql', '$set', '$vars', '$page',
    `"use strict"; return (async () => { ${code} })()`
  )
  await fn(execSql, setVar, vars, props.page)
}

async function execSql(query: string): Promise<unknown> {
  const res = await fetch('/api/sql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sql: query }),
  })
  const json = await res.json() as { code: number; data: unknown }
  if (json.code !== 0) throw new Error(`SQL 执行失败`)
  return json.data
}

const runtime: RuntimeContext = { vars, setVar, runScript }

function widgetComponent(type: WidgetType) {
  return WIDGET_COMPONENTS[type]
}

onMounted(async () => {
  if (props.page.initScript?.trim()) {
    try { await runScript(props.page.initScript) } catch (e) {
      console.error('[LowCode] initScript 执行失败:', e)
    }
  }
})
</script>
