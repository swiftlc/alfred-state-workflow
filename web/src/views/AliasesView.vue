<template>
  <div>
    <h1 class="text-lg font-semibold text-slate-800 mb-5 tracking-tight">别名</h1>

    <n-input
      v-model:value="searchText"
      placeholder="搜索别名 / 标题..."
      clearable
      style="margin-bottom: 16px"
    />

    <n-data-table
      :columns="columns"
      :data="filteredItems"
      :loading="loading"
      :bordered="false"
      :single-line="false"
      size="small"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { Trash2 } from '@lucide/vue'
import { NDataTable, NInput, NTag, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { getAliases, deleteAlias } from '@/api/alfred'
import { matchQuery, formatTime } from '@/utils/search'
import type { Alias } from '@/types'

const message = useMessage()
const dialog  = useDialog()

const loading    = ref(false)
const items      = ref<Alias[]>([])
const searchText = ref('')

const filteredItems = computed(() => {
  const q = searchText.value.trim()
  if (!q) return items.value
  return items.value.filter(i => matchQuery(q, i.alias, i.title, i.subtitle))
})

function doDelete(item: Alias) {
  dialog.warning({
    title: '确认删除',
    content: `删除别名「${item.alias}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await deleteAlias(item.id)
      items.value = items.value.filter(i => i.id !== item.id)
      message.success('已删除')
    },
  })
}

const columns: DataTableColumns<Alias> = [
  {
    title: '别名', key: 'alias', width: 140,
    render: (row) => h(NTag, {
      size: 'small', bordered: false,
      style: 'font-family:monospace; background:#eef2ff; color:#4f46e5; font-size:12px; font-weight:600',
    }, { default: () => row.alias }),
  },
  {
    title: '对应条目', key: 'title',
    render: (row) => h('div', {}, [
      h('div', { style: 'font-weight:500' }, row.title),
      row.subtitle
        ? h('div', { style: 'font-size:12px; color:#9ca3af; margin-top:1px' }, row.subtitle)
        : null,
    ]),
  },
  {
    title: '使用次数', key: 'usageCount', width: 90,
    render: (row) => h('span', { style: 'color:#6b7280' }, String(row.usageCount)),
  },
  {
    title: '最近使用', key: 'lastUsedAt', width: 110,
    render: (row) => h('span', {
      style: 'color:#9ca3af; font-size:12px',
      title: row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString('zh-CN') : '',
    }, formatTime(row.lastUsedAt) || '从未'),
  },
  {
    title: '', key: 'del', width: 44,
    render: (row) => h('span', {
      class: 'del-btn',
      style: 'cursor:pointer; display:inline-flex; align-items:center; color:#d1d5db',
      title: '删除',
      onClick: () => doDelete(row),
    }, [h(Trash2, { size: 14 })]),
  },
]

onMounted(async () => {
  loading.value = true
  try { items.value = await getAliases() }
  finally { loading.value = false }
})
</script>

<style scoped>
:deep(.del-btn:hover) { color: #ef4444 !important; }
</style>
