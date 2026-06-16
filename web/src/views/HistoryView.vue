<template>
  <div class="flex flex-col overflow-hidden" style="height: 100%">
    <div class="flex items-center justify-between mb-5 shrink-0">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">历史记录</h1>
      <n-button size="small" :disabled="!hasUnpinned" @click="doClear">清空未置顶</n-button>
    </div>

    <n-input
      v-model:value="searchText"
      placeholder="搜索标题 / 描述 / 复制值..."
      clearable
      class="shrink-0"
      style="margin-bottom: 16px"
    />

    <n-data-table
      :columns="columns"
      :data="filteredItems"
      :loading="loading"
      :bordered="false"
      :single-line="false"
      size="small"
      flex-height
      class="flex-1"
      :row-class-name="(row: HistoryItem) => row.isPinned ? 'pinned-row' : ''"
    />

    <!-- 创建别名 Modal -->
    <n-modal v-model:show="aliasModal.show" preset="dialog" title="创建别名"
             positive-text="创建" negative-text="取消"
             :positive-loading="aliasModal.loading"
             @positive-click="submitAlias">
      <n-form style="margin-top:12px">
        <n-form-item label="别名">
          <n-input v-model:value="aliasModal.alias" placeholder="输入快捷别名，如 dep-prod" />
        </n-form-item>
        <div v-if="aliasModal.item" class="text-xs text-slate-400">
          关联动作：{{ aliasModal.item.title }}
        </div>
      </n-form>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h, reactive } from 'vue'
import { Pin, Trash2 } from '@lucide/vue'
import { NDataTable, NInput, NButton, NModal, NForm, NFormItem, useMessage, useDialog } from 'naive-ui'
import ContextTags from '@/components/ContextTags.vue'
import InlineEdit from '@/components/InlineEdit.vue'
import type { DataTableColumns } from 'naive-ui'
import { getHistory, deleteHistory, clearHistory, toggleHistoryPin, createAlias, renameHistory, patchHistoryData } from '@/api/alfred'
import { matchQuery, formatTime } from '@/utils/search'
import type { HistoryItem, ContextDataItem } from '@/types'

const message = useMessage()
const dialog  = useDialog()

const loading    = ref(false)
const items      = ref<HistoryItem[]>([])
const searchText = ref('')

const hasUnpinned = computed(() => items.value.some(i => !i.isPinned))

const filteredItems = computed(() => {
  const q = searchText.value.trim()
  if (!q) return items.value
  return items.value.filter(i => matchQuery(q, i.title, i.subtitle, i.copyValue, i.copyName))
})

async function doTogglePin(item: HistoryItem) {
  await toggleHistoryPin(item.id)
  item.isPinned = !item.isPinned
  items.value.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    return b.timestamp - a.timestamp
  })
  message.success(item.isPinned ? '已置顶' : '已取消置顶')
}

function doDelete(item: HistoryItem) {
  dialog.warning({
    title: '确认删除',
    content: `删除「${item.title}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await deleteHistory(item.id)
      items.value = items.value.filter(i => i.id !== item.id)
      message.success('已删除')
    },
  })
}

async function doRenameHistoryTitle(item: HistoryItem, title: string) {
  if (!title) return
  await renameHistory(item.id, title, item.subtitle)
  item.title = title
  message.success('已修改')
}

async function doRenameHistorySubtitle(item: HistoryItem, subtitle: string) {
  await renameHistory(item.id, item.title, subtitle || undefined)
  item.subtitle = subtitle || undefined
  message.success('已修改')
}

async function updateHistoryContext(item: HistoryItem, key: string, val: ContextDataItem) {
  item.data = { ...item.data, [key]: val }
  await patchHistoryData(item.id, item.data as Record<string, unknown>)
  message.success(`已更新上下文「${key}」`)
}

const aliasModal = reactive({ show: false, loading: false, alias: '', item: null as HistoryItem | null })

function openAliasModal(item: HistoryItem) {
  aliasModal.alias = ''
  aliasModal.item  = item
  aliasModal.show  = true
}

async function submitAlias() {
  if (!aliasModal.alias.trim()) { message.error('别名不能为空'); return false }
  const item = aliasModal.item!
  aliasModal.loading = true
  try {
    await createAlias({
      alias:    aliasModal.alias.trim(),
      action:   item.action,
      data:     item.data as Record<string, unknown>,
      title:    item.title,
      subtitle: item.subtitle,
    })
    message.success('别名已创建')
  } catch (e) {
    message.error((e as Error).message || '创建别名失败')
    return false
  } finally {
    aliasModal.loading = false
  }
}

function doClear() {
  dialog.warning({
    title: '清空历史',
    content: '将删除所有未置顶的历史记录，确认？',
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      await clearHistory()
      items.value = items.value.filter(i => i.isPinned)
      message.success('已清空')
    },
  })
}

const columns: DataTableColumns<HistoryItem> = [
  {
    title: '', key: 'pin', width: 40,
    render: (row) => h('span', {
      style: `cursor:pointer; display:inline-flex; align-items:center; color:${row.isPinned ? '#5b6af0' : '#9ca3af'}`,
      title: row.isPinned ? '取消置顶' : '置顶',
      onClick: () => doTogglePin(row),
    }, [h(Pin, { size: 14 })]),
  },
  {
    title: '标题', key: 'title',
    render: (row) => h('div', {}, [
      h(InlineEdit, {
        value: row.title,
        displayStyle: 'font-weight:500',
        onConfirm: (val: string) => doRenameHistoryTitle(row, val),
      }),
      h('div', { style: 'margin-top:2px' }, [
        h(InlineEdit, {
          value: row.subtitle ?? '',
          placeholder: '添加副标题',
          displayStyle: 'font-size:12px; color:#9ca3af',
          inputStyle: 'font-size:12px; color:#9ca3af',
          onConfirm: (val: string) => doRenameHistorySubtitle(row, val),
        }),
      ]),
      Object.keys(row.data ?? {}).length
        ? h('div', { style: 'margin-top:5px' }, [
            h(ContextTags, {
              data: row.data as Record<string, unknown>,
              editable: true,
              onSelect: (key: string, val: ContextDataItem) => updateHistoryContext(row, key, val),
            }),
          ])
        : null,
    ]),
  },
  {
    title: '复制值', key: 'copyValue', width: 220,
    render: (row) => {
      if (!row.copyValue && !row.copyKey) return h('span', { style: 'color:#d1d5db' }, '—')
      const label = row.copyName ? `${row.copyName}: ${row.copyValue}` : (row.copyValue ?? row.copyKey ?? '')
      return h('span', {
        style: 'font-family:monospace; font-size:12px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; max-width:200px',
        title: label,
      }, label)
    },
  },
  {
    title: '时间', key: 'timestamp', width: 110,
    render: (row) => h('span', {
      style: 'color:#9ca3af; font-size:12px',
      title: new Date(row.timestamp).toLocaleString('zh-CN'),
    }, formatTime(row.timestamp)),
  },
  {
    title: '操作', key: 'actions', width: 110,
    render: (row) => h('div', { style: 'display:flex; align-items:center; gap:6px' }, [
      h(NButton, {
        size: 'tiny', ghost: true,
        onClick: () => openAliasModal(row),
      }, { default: () => '创建别名' }),
      h('span', {
        class: 'del-btn',
        style: 'cursor:pointer; display:inline-flex; align-items:center; color:#d1d5db',
        title: '删除',
        onClick: () => doDelete(row),
      }, [h(Trash2, { size: 14 })]),
    ]),
  },
]

onMounted(async () => {
  loading.value = true
  try { items.value = await getHistory() }
  finally { loading.value = false }
})
</script>

<style scoped>
:deep(.pinned-row td) { background: rgba(91, 106, 240, 0.04); }
:deep(.del-btn:hover) { color: #ef4444 !important; }
</style>
