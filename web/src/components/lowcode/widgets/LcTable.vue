<template>
  <div class="w-full h-full overflow-auto">
    <table v-if="rows.length" class="w-full text-xs border-collapse">
      <thead>
        <tr class="bg-slate-50">
          <th
            v-for="col in cols"
            :key="col.key"
            class="text-left px-2 py-1.5 font-medium text-slate-500 border-b border-slate-100 whitespace-nowrap"
          >{{ col.title }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i" class="hover:bg-slate-50/60">
          <td
            v-for="col in cols"
            :key="col.key"
            class="px-2 py-1.5 border-b border-slate-50 text-slate-600 font-mono"
          >{{ row[col.key] ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else class="flex items-center justify-center h-full text-slate-300 text-xs">暂无数据</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Widget, RuntimeContext, TableProps } from '@/types/lowcode'

const props = defineProps<{ widget: Widget; runtime: RuntimeContext; selected?: boolean }>()

const tableProps = computed(() => props.widget.props as TableProps)
const cols = computed(() => tableProps.value.columns ?? [])
const rows = computed(() => {
  const val = props.runtime.vars[tableProps.value.dataVar]
  return Array.isArray(val) ? val as Record<string, unknown>[] : []
})
</script>
