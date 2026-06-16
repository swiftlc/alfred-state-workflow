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
import { NDataTable, NInput, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { getAliases, deleteAlias, patchAliasData, renameAlias } from '@/api/alfred'
import { matchQuery, formatTime } from '@/utils/search'
import ContextTags from '@/components/ContextTags.vue'
import InlineEdit from '@/components/InlineEdit.vue'
import type { Alias, ContextDataItem } from '@/types'

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

async function updateAliasContext(item: Alias, key: string, val: ContextDataItem) {
  item.data = { ...item.data, [key]: val }
  await patchAliasData(item.id, item.data as Record<string, unknown>)
  message.success(`已更新上下文「${key}」`)
}

async function doRenameAlias(item: Alias, fields: { alias?: string; title?: string; subtitle?: string }) {
  // 唯一性校验：别名不能与其他条目重复
  if (fields.alias !== undefined) {
    const newAlias = fields.alias.trim()
    const dup = items.value.find(i => i.id !== item.id && i.alias === newAlias)
    if (dup) { message.error(`别名「${newAlias}」已存在`); return }
  }
  await renameAlias(item.id, fields)
  if (fields.alias    !== undefined) item.alias    = fields.alias
  if (fields.title    !== undefined) item.title    = fields.title
  if (fields.subtitle !== undefined) item.subtitle = fields.subtitle || undefined
  message.success('已修改')
}

const ALIAS_TAG_STYLE = 'font-family:monospace; background:#eef2ff; color:#4f46e5; font-size:12px; font-weight:600; padding:1px 7px; border-radius:4px'
const ALIAS_INPUT_STYLE = 'font-family:monospace; font-size:12px; font-weight:600; color:#4f46e5'

const columns: DataTableColumns<Alias> = [
  {
    title: '别名', key: 'alias', width: 140,
    render: (row) => h(InlineEdit, {
      value: row.alias,
      displayStyle: ALIAS_TAG_STYLE,
      inputStyle: ALIAS_INPUT_STYLE,
      onConfirm: (val: string) => doRenameAlias(row, { alias: val }),
    }),
  },
  {
    title: '对应条目', key: 'title',
    render: (row) => h('div', {}, [
      h(InlineEdit, {
        value: row.title,
        displayStyle: 'font-weight:500',
        onConfirm: (val: string) => doRenameAlias(row, { title: val }),
      }),
      h('div', { style: 'margin-top:2px' }, [
        h(InlineEdit, {
          value: row.subtitle ?? '',
          placeholder: '添加副标题',
          displayStyle: 'font-size:12px; color:#9ca3af',
          inputStyle: 'font-size:12px; color:#9ca3af',
          onConfirm: (val: string) => doRenameAlias(row, { subtitle: val }),
        }),
      ]),
      Object.keys(row.data ?? {}).length
        ? h('div', { style: 'margin-top:5px' }, [
            h(ContextTags, {
              data: row.data as Record<string, unknown>,
              editable: true,
              onSelect: (key: string, val: ContextDataItem) => updateAliasContext(row, key, val),
            }),
          ])
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
