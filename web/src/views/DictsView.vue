<template>
  <div>
    <n-h2 style="margin-bottom: 16px">字典管理</n-h2>

    <n-spin :show="loading">
      <n-data-table
        :columns="columns"
        :data="dicts"
        :bordered="false"
        :single-line="false"
        :row-props="rowProps"
        style="cursor: pointer"
      />
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NH2, NDataTable, NSpin } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { getDicts } from '@/api/alfred'
import { READONLY_DICTS } from '@/config/dicts'

interface DictRow { key: string; name: string }

const router  = useRouter()
const dicts   = ref<DictRow[]>([])
const loading = ref(false)

const columns: DataTableColumns<DictRow> = [
  { title: 'Key',  key: 'key',  width: 160 },
  { title: '名称', key: 'name' },
]

function rowProps(row: DictRow) {
  return { onClick: () => router.push(`/dicts/${row.key}`) }
}

onMounted(async () => {
  loading.value = true
  try {
    const editable = await getDicts()
    const readonly  = READONLY_DICTS.map(d => ({ key: d.key, name: d.name }))
    dicts.value = [...editable, ...readonly]
  } finally {
    loading.value = false
  }
})
</script>
