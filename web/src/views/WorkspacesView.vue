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
import { Trash2, Bookmark } from '@lucide/vue'
import { NDataTable, NSpace, NButton, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { getWorkspaces, deleteWorkspace, setContext, patchWorkspaceData, renameWorkspace, setDefaultWorkspace } from '@/api/alfred'
import { formatTime } from '@/utils/search'
import ContextTags from '@/components/ContextTags.vue'
import InlineEdit from '@/components/InlineEdit.vue'
import type { Workspace, ContextDataItem } from '@/types'

const message = useMessage()
const dialog  = useDialog()

const loading = ref(false)
const items   = ref<Workspace[]>([])

async function doToggleDefault(item: Workspace) {
  const { isDefault } = await setDefaultWorkspace(item.id)
  items.value.forEach(i => { i.isDefault = i.id === item.id ? isDefault : false })
  message.success(isDefault ? `「${item.name}」已设为默认工作区` : '已取消默认工作区')
}

async function doApplyContext(item: Workspace) {
  await setContext({ state: 'home', data: item.data as never })
  message.success(`已将工作区「${item.name}」应用到上下文`)
}

async function doRenameWorkspace(item: Workspace, name: string) {
  await renameWorkspace(item.id, name)
  item.name = name
  message.success('已修改')
}

async function updateWorkspaceContext(item: Workspace, key: string, val: ContextDataItem) {
  item.data = { ...item.data, [key]: val }
  await patchWorkspaceData(item.id, item.data as Record<string, unknown>)
  message.success(`已更新上下文「${key}」`)
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
    render: (row) => h(InlineEdit, {
      value: row.name,
      displayStyle: 'font-weight:500',
      onConfirm: (val: string) => doRenameWorkspace(row, val),
    }),
  },
  {
    title: '快照内容', key: 'data',
    render: (row) => {
      if (!Object.keys(row.data ?? {}).length) return h('span', { style: 'color:#d1d5db' }, '空')
      return h('div', { style: 'padding:4px 0' }, [
        h(ContextTags, {
          data: row.data as Record<string, unknown>,
          editable: true,
          onSelect: (key: string, val: ContextDataItem) => updateWorkspaceContext(row, key, val),
        }),
      ])
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
    title: '操作', key: 'actions', width: 160,
    render: (row) => h(NSpace, { size: 'small', align: 'center' }, {
      default: () => [
        h('span', {
          title: row.isDefault ? '取消默认' : '设为默认',
          style: `cursor:pointer; display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:4px; color:${row.isDefault ? '#6366f1' : '#d1d5db'}; ${row.isDefault ? 'background:rgba(99,102,241,0.08)' : ''}`,
          onClick: () => doToggleDefault(row),
        }, [h(Bookmark, { size: 14, fill: row.isDefault ? '#6366f1' : 'none' })]),
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

