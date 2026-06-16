<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">字典管理</h1>
      <n-input
        v-model:value="searchText"
        placeholder="搜索 Key / 名称…"
        clearable
        size="small"
        style="width:220px"
      />
    </div>

    <n-spin :show="loading">
      <!-- 可编辑字典 -->
      <template v-if="editableFiltered.length">
        <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">可编辑</div>
        <n-data-table
          :columns="columns"
          :data="editableFiltered"
          :bordered="false"
          :single-line="false"
          :row-props="rowProps"
          size="small"
          style="cursor:pointer;margin-bottom:20px"
        />
      </template>

      <!-- 只读字典 -->
      <template v-if="readonlyFiltered.length">
        <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">只读</div>
        <n-data-table
          :columns="columns"
          :data="readonlyFiltered"
          :bordered="false"
          :single-line="false"
          :row-props="rowProps"
          size="small"
          style="cursor:pointer"
        />
      </template>

      <!-- 无结果 -->
      <div v-if="!loading && !editableFiltered.length && !readonlyFiltered.length"
           class="text-center text-slate-400 text-sm py-12">
        未找到「{{ searchText }}」
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NDataTable, NSpin, NInput } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { getDicts } from '@/api/alfred'
import { READONLY_DICTS } from '@/config/dicts'
import { matchQuery } from '@/utils/search'

interface DictRow { key: string; name: string }

const router     = useRouter()
const loading    = ref(false)
const searchText = ref('')
const editable   = ref<DictRow[]>([])
const readonly   = ref<DictRow[]>(READONLY_DICTS.map(d => ({ key: d.key, name: d.name })))

const editableFiltered = computed(() => {
  const q = searchText.value.trim()
  return q ? editable.value.filter(d => matchQuery(q, d.key, d.name)) : editable.value
})

const readonlyFiltered = computed(() => {
  const q = searchText.value.trim()
  return q ? readonly.value.filter(d => matchQuery(q, d.key, d.name)) : readonly.value
})

const columns: DataTableColumns<DictRow> = [
  { title: 'Key',  key: 'key',  width: 180 },
  { title: '名称', key: 'name' },
]

function rowProps(row: DictRow) {
  return { onClick: () => router.push(`/dicts/${row.key}`) }
}

onMounted(async () => {
  loading.value = true
  try { editable.value = await getDicts() }
  finally { loading.value = false }
})
</script>
