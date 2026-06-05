<template>
  <div>
    <!-- 页头 -->
    <n-page-header :title="dictName" @back="router.back()">
      <template #extra>
        <n-button v-if="!isReadonly" type="primary" size="small" @click="openAddModal">
          + 新增条目
        </n-button>
      </template>
    </n-page-header>

    <!-- 搜索 -->
    <n-input
      v-model:value="searchText"
      placeholder="搜索名称 / Value / 描述..."
      clearable
      style="margin: 16px 0"
    />

    <!-- 条目表格 -->
    <n-data-table
      :columns="columns"
      :data="filteredItems"
      :loading="loading"
      :bordered="false"
      :single-line="false"
      size="small"
      :row-class-name="(row: DictItem) => row.pinned ? 'pinned-row' : ''"
    />

    <!-- 编辑描述 Modal -->
    <n-modal v-model:show="editModal.show" preset="dialog" title="修改描述" positive-text="保存" negative-text="取消" @positive-click="submitEdit">
      <n-form style="margin-top: 12px">
        <n-form-item label="Name">
          <n-input v-model:value="editModal.name" :disabled="isReadonly" />
        </n-form-item>
        <n-form-item label="Value">
          <n-input v-model:value="editModal.value" :disabled="isReadonly" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="editModal.description" type="textarea" :rows="3" />
        </n-form-item>
      </n-form>
    </n-modal>

    <!-- 新增条目 Modal -->
    <n-modal v-model:show="addModal.show" preset="dialog" title="新增条目" positive-text="添加" negative-text="取消" @positive-click="submitAdd">
      <n-form style="margin-top: 12px">
        <n-form-item label="Name *">
          <n-input v-model:value="addModal.name" placeholder="显示名称" />
        </n-form-item>
        <n-form-item label="Value">
          <n-input v-model:value="addModal.value" placeholder="可选，默认与 Name 相同" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="addModal.description" type="textarea" :rows="2" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h, reactive } from 'vue'
import { Pin } from '@lucide/vue'
import { matchQuery } from '@/utils/search'
import { useRoute, useRouter } from 'vue-router'
import {
  NPageHeader, NDataTable, NInput, NButton, NModal, NForm,
  NFormItem, NSpace, useMessage, useDialog,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  getDicts, getDictItems, createDictItem, updateDictItem,
  deleteDictItem, toggleDictPin, getDictMeta, updateDictItemDescription,
} from '@/api/alfred'
import { READONLY_DICTS } from '@/config/dicts'
import type { DictMeta, DictItem } from '@/types'

const route   = useRoute()
const router  = useRouter()
const message = useMessage()
const dialog  = useDialog()

const key       = computed(() => route.params.key as string)
const loading   = ref(false)
const items     = ref<DictItem[]>([])
const dictMeta  = ref<DictMeta | null>(null)
const searchText = ref('')

const dictName   = computed(() => dictMeta.value?.name ?? key.value)
const isReadonly = computed(() => READONLY_DICTS.some(d => d.key === key.value))


const filteredItems = computed(() => {
  const query = searchText.value.trim()
  if (!query) return items.value
  return items.value.filter(i => matchQuery(query, i.name, i.value, i.description))
})

// ─── 置顶 Toggle ──────────────────────────────────────────────────────────────
async function doTogglePin(item: DictItem) {
  const fullKey = `${key.value}:${item.id}`
  const { pinned } = await toggleDictPin(fullKey)
  item.pinned = pinned
  // 重新排序：置顶的移到前面
  items.value.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.lastUsedAt - a.lastUsedAt
  })
  message.success(pinned ? '已置顶' : '已取消置顶')
}

// ─── 编辑 Modal ───────────────────────────────────────────────────────────────
const editModal = reactive({
  show: false,
  id: '',
  name: '',
  value: '',
  description: '',
})

function openEditModal(item: DictItem) {
  Object.assign(editModal, { show: true, id: item.id, name: item.name, value: item.value, description: item.description })
}

async function submitEdit() {
  const item = items.value.find(i => i.id === editModal.id)
  if (isReadonly.value) {
    await updateDictItemDescription(`${key.value}:${editModal.id}`, editModal.description)
    if (item) item.description = editModal.description
  } else {
    await updateDictItem(key.value, editModal.id, {
      name: editModal.name,
      value: editModal.value,
      description: editModal.description,
    })
    if (item) Object.assign(item, { name: editModal.name, value: editModal.value, description: editModal.description })
  }
  message.success('已保存')
  return true
}

// ─── 新增 Modal ───────────────────────────────────────────────────────────────
const addModal = reactive({ show: false, name: '', value: '', description: '' })

function openAddModal() {
  Object.assign(addModal, { show: true, name: '', value: '', description: '' })
}

async function submitAdd() {
  if (!addModal.name) { message.error('Name 不能为空'); return false }
  await createDictItem(key.value, {
    name: addModal.name,
    value: addModal.value || addModal.name,
    description: addModal.description,
  })
  message.success('已添加')
  await loadItems()
  return true
}

// ─── 删除 ──────────────────────────────────────────────────────────────────────
function doDelete(item: DictItem) {
  dialog.warning({
    title: '确认删除',
    content: `删除「${item.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await deleteDictItem(key.value, item.id)
      items.value = items.value.filter(i => i.id !== item.id)
      message.success('已删除')
    },
  })
}

// ─── 表格列定义 ────────────────────────────────────────────────────────────────
const columns = computed<DataTableColumns<DictItem>>(() => [
  {
    title: '',
    key: 'pin',
    width: 40,
    render: (row) => h('span', {
      style: `cursor:pointer; display:inline-flex; align-items:center; color:${row.pinned ? '#5b6af0' : '#9ca3af'}`,
      title: row.pinned ? '取消置顶' : '置顶',
      onClick: () => doTogglePin(row),
    }, [h(Pin, { size: 14 })]),
  },
  { title: 'Name',  key: 'name',  ellipsis: { tooltip: true } },
  { title: 'Value', key: 'value', ellipsis: { tooltip: true } },
  {
    title: '描述',
    key: 'description',
    ellipsis: { tooltip: true },
    render: (row) => row.description || h('span', { style: 'opacity:0.3' }, '—'),
  },
  {
    title: '最近使用',
    key: 'lastUsedAt',
    width: 160,
    render: (row) => row.lastUsedAt
      ? new Date(row.lastUsedAt).toLocaleString('zh-CN')
      : h('span', { style: 'opacity:0.3' }, '从未'),
  },
  {
    title: '操作',
    key: 'actions',
    width: isReadonly.value ? 100 : 160,
    render: (row) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'tiny', ghost: true, onClick: () => openEditModal(row) }, { default: () => '编辑' }),
        !isReadonly.value && h(NButton, {
          size: 'tiny', ghost: true, type: 'error',
          onClick: () => doDelete(row),
        }, { default: () => '删除' }),
      ],
    }),
  },
])

// ─── 数据加载 ─────────────────────────────────────────────────────────────────
async function loadItems() {
  loading.value = true
  try { items.value = await getDictItems(key.value) }
  finally { loading.value = false }
}

onMounted(async () => {
  const readonlyConfig = READONLY_DICTS.find(d => d.key === key.value)
  if (readonlyConfig) {
    dictMeta.value = { key: readonlyConfig.key, name: readonlyConfig.name }
    loading.value = true
    try {
      const [fetchedItems, meta] = await Promise.all([
        readonlyConfig.fetchItems(),
        getDictMeta(key.value),
      ])
      items.value = fetchedItems.map(item => ({
        ...item,
        pinned:      meta[item.id]?.pinned ?? false,
        lastUsedAt:  meta[item.id]?.lastUsedAt ?? 0,
        description: meta[item.id]?.description || item.description,
      }))
      items.value.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.lastUsedAt - a.lastUsedAt
      })
    } finally { loading.value = false }
  } else {
    const allDicts = await getDicts()
    dictMeta.value = allDicts.find(d => d.key === key.value) ?? null
    await loadItems()
  }
})
</script>

<style scoped>
:deep(.pinned-row td) { background: rgba(91, 106, 240, 0.04); }
</style>
