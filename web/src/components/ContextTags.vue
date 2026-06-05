<template>
  <div v-if="tagItems.length" class="ctx-tags">
    <span
      v-for="tag in tagItems"
      :key="tag.key"
      class="ctx-tag"
      :class="{ 'is-editable': editable }"
      :title="editable ? `点击修改 ${tag.dictName}` : `${tag.key}: ${tag.name}`"
      @click="editable && openPicker(tag.key)"
    >
      <span class="ctx-tag__key">{{ tag.dictName }}</span>
      <span class="ctx-tag__sep">·</span>
      <span class="ctx-tag__name">{{ tag.name }}</span>
    </span>

    <DictPicker
      v-model:show="picker.show"
      :dict-key="picker.key"
      :dict-name="picker.dictName"
      :fetch-items="picker.fetchItems"
      :current-value="picker.currentValue"
      @select="onSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import DictPicker from '@/components/DictPicker.vue'
import { READONLY_DICTS } from '@/config/dicts'
import { makeFetchItems } from '@/utils/dict'
import type { ContextDataItem, DictItem } from '@/types'

const props = withDefaults(defineProps<{
  data: Record<string, unknown>
  editable?: boolean
}>(), {
  editable: false,
})

const emit = defineEmits<{
  select: [key: string, item: ContextDataItem]
}>()

// ─── 字典名称（只读+可编辑均支持） ───────────────────────────────────────────
const roNameMap: Record<string, string> = Object.fromEntries(
  READONLY_DICTS.map(d => [d.key, d.name])
)

function dictNameOf(key: string) {
  return roNameMap[key] ?? key
}

// ─── tag 列表 ─────────────────────────────────────────────────────────────────
interface TagItem { key: string; dictName: string; name: string; raw: unknown }

const tagItems = computed<TagItem[]>(() =>
  Object.entries(props.data ?? {}).map(([key, v]) => {
    const name = v && typeof v === 'object'
      ? ((v as Record<string, unknown>).name as string ?? '')
      : String(v ?? '')
    return { key, dictName: dictNameOf(key), name, raw: v }
  }).filter(t => t.name)
)

// ─── DictPicker 状态 ──────────────────────────────────────────────────────────
const picker = reactive<{
  show: boolean
  key: string
  dictName: string
  fetchItems: () => Promise<DictItem[]>
  currentValue: ContextDataItem | null
}>({
  show:         false,
  key:          '',
  dictName:     '',
  fetchItems:   () => Promise.resolve([]),
  currentValue: null,
})

function openPicker(key: string) {
  const tag = tagItems.value.find(t => t.key === key)
  picker.key          = key
  picker.dictName     = dictNameOf(key)
  picker.fetchItems   = makeFetchItems(key)
  picker.currentValue = tag?.raw && typeof tag.raw === 'object'
    ? tag.raw as ContextDataItem
    : null
  picker.show = true
}

function onSelect(item: ContextDataItem) {
  emit('select', picker.key, item)
}
</script>

<style scoped>
.ctx-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ctx-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 4px;
  background: #f1f5f9;
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  user-select: none;
}

.ctx-tag.is-editable {
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.ctx-tag.is-editable:hover {
  background: #e0e7ff;
  color: #4f46e5;
}
.ctx-tag.is-editable:hover .ctx-tag__key { color: #818cf8; }

.ctx-tag__key  { font-family: monospace; color: #94a3b8; }
.ctx-tag__sep  { color: #cbd5e1; margin: 0 1px; }
.ctx-tag__name { font-weight: 500; }
</style>
