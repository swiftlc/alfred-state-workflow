<template>
  <div>
    <h1 class="text-lg font-semibold text-slate-800 mb-5 tracking-tight">工作区</h1>

    <n-data-table
      :columns="columns"
      :data="items"
      :loading="loading"
      :bordered="false"
      :single-line="false"
      size="small"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { Trash2 } from '@lucide/vue'
import { NDataTable, NTag, NSpace, NButton, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { getWorkspaces, deleteWorkspace, setContext } from '@/api/alfred'
import { formatTime } from '@/utils/search'
import type { Workspace } from '@/types'

const message = useMessage()
const dialog  = useDialog()

const loading = ref(false)
const items   = ref<Workspace[]>([])

function summarizeData(data: Record<string, unknown>): Array<{ key: string; label: string }> {
  return Object.entries(data).map(([k, v]) => {
    const label = v && typeof v === 'object' ? ((v as Record<string, unknown>).name as string ?? JSON.stringify(v)) : String(v ?? '')
    return { key: k, label }
  })
}

async function doApplyContext(item: Workspace) {
  await setContext({ state: 'home', data: item.data as never })
  message.success(`已将工作区「${item.name}」应用到上下文`)
}

function doDelete(item: Workspace) {
  dialog.warning({
    title: '确认删除',
    content: `删除工作区「${item.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await deleteWorkspace(item.id)
      items.value = items.value.filter(i => i.id !== item.id)
      message.success('已删除')
    },
  })
}

const columns: DataTableColumns<Workspace> = [
  {
    title: '名称', key: 'name', width: 180,
    render: (row) => h('span', { style: 'font-weight:500' }, row.name),
  },
  {
    title: '快照内容', key: 'data',
    render: (row) => {
      const tags = summarizeData(row.data)
      if (!tags.length) return h('span', { style: 'color:#d1d5db' }, '空')
      return h(NSpace, { size: 4, wrap: true }, {
        default: () => tags.map(({ key, label }) =>
          h(NTag, { size: 'small', bordered: false, style: 'background:#f1f4fb; color:#4b5563; font-size:11px' }, {
            default: () => `${key}: ${label}`,
          })
        ),
      })
    },
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
    title: '操作', key: 'actions', width: 130,
    render: (row) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, {
          size: 'tiny', ghost: true,
          onClick: () => doApplyContext(row),
        }, { default: () => '应用上下文' }),
        h(NButton, {
          size: 'tiny', ghost: true, type: 'error',
          onClick: () => doDelete(row),
        }, { default: () => h(Trash2, { size: 13 }) }),
      ],
    }),
  },
]

onMounted(async () => {
  loading.value = true
  try { items.value = await getWorkspaces() }
  finally { loading.value = false }
})
</script>

