<template>
  <div>
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">历史记录</h1>
      <n-button size="small" :disabled="!hasUnpinned" @click="doClear">清空未置顶</n-button>
    </div>

    <n-input
      v-model:value="searchText"
      placeholder="搜索标题 / 描述 / 复制值..."
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
      :row-class-name="(row: HistoryItem) => row.isPinned ? 'pinned-row' : ''"
    />

    <!-- 改名 Modal -->
    <n-modal v-model:show="renameModal.show" preset="dialog" title="修改名称"
             positive-text="保存" negative-text="取消" @positive-click="submitRename">
      <n-form style="margin-top:12px">
        <n-form-item label="标题">
          <n-input v-model:value="renameModal.title" placeholder="条目标题" />
        </n-form-item>
        <n-form-item label="副标题">
          <n-input v-model:value="renameModal.subtitle" placeholder="可选" />
        </n-form-item>
      </n-form>
    </n-modal>

    <!-- 创建别名 Modal -->
    <n-modal v-model:show="aliasModal.show" preset="dialog" title="创建别名"
             positive-text="创建" negative-text="取消" @positive-click="submitAlias">
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
import type { DataTableColumns } from 'naive-ui'
import { getHistory, deleteHistory, clearHistory, toggleHistoryPin, createAlias, renameHistory } from '@/api/alfred'
import { matchQuery, formatTime } from '@/utils/search'
import type { HistoryItem } from '@/types'

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

const renameModal = reactive({ show: false, title: '', subtitle: '', item: null as HistoryItem | null })

function openRenameModal(item: HistoryItem) {
  renameModal.title    = item.title
  renameModal.subtitle = item.subtitle ?? ''
  renameModal.item     = item
  renameModal.show     = true
}

async function submitRename() {
  if (!renameModal.title.trim()) { message.error('标题不能为空'); return false }
  const item = renameModal.item!
  await renameHistory(item.id, renameModal.title.trim(), renameModal.subtitle.trim() || undefined)
  item.title    = renameModal.title.trim()
  item.subtitle = renameModal.subtitle.trim() || undefined
  message.success('已修改')
  return true
}

const aliasModal = reactive({ show: false, alias: '', item: null as HistoryItem | null })

function openAliasModal(item: HistoryItem) {
  aliasModal.alias = ''
  aliasModal.item  = item
  aliasModal.show  = true
}

async function submitAlias() {
  if (!aliasModal.alias.trim()) { message.error('别名不能为空'); return false }
  const item = aliasModal.item!
  await createAlias({
    alias:    aliasModal.alias.trim(),
    action:   item.action,
    data:     item.data as Record<string, unknown>,
    title:    item.title,
    subtitle: item.subtitle,
  })
  message.success('别名已创建')
  return true
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
      h('div', { style: 'font-weight:500' }, row.title),
      row.subtitle
        ? h('div', { style: 'font-size:12px; color:#9ca3af; margin-top:1px' }, row.subtitle)
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
    title: '操作', key: 'actions', width: 160,
    render: (row) => h('div', { style: 'display:flex; align-items:center; gap:6px' }, [
      h(NButton, {
        size: 'tiny', ghost: true,
        onClick: () => openRenameModal(row),
      }, { default: () => '改名' }),
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
