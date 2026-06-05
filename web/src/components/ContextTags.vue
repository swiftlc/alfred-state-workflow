<template>
  <div v-if="tagItems.length" class="ctx-tags">
    <n-dropdown
      v-for="tag in tagItems"
      :key="tag.key"
      trigger="click"
      placement="bottom-start"
      :options="menuFor(tag)"
      @select="(k: string) => handleMenu(k, tag)"
    >
      <span class="ctx-tag" :title="`${tag.key}: ${tag.name}`">
        <span class="ctx-tag__key">{{ tag.dictName }}</span>
        <span class="ctx-tag__sep">·</span>
        <span class="ctx-tag__name">{{ tag.name }}</span>
      </span>
    </n-dropdown>

    <DictPicker
      v-model:show="picker.show"
      :dict-key="picker.key"
      :dict-name="picker.dictName"
      :fetch-items="picker.fetchItems"
      :current-value="picker.currentValue"
      @select="onPickerSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, h } from 'vue'
import { NDropdown, useMessage } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { CheckCheck, Check, Pencil, Copy, Files } from '@lucide/vue'
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
  applyAll: [data: Record<string, unknown>]
}>()

const message = useMessage()

// ─── 字典名称 ─────────────────────────────────────────────────────────────────

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

// ─── 复制辅助 ─────────────────────────────────────────────────────────────────

function rawValue(tag: TagItem): string {
  if (tag.raw && typeof tag.raw === 'object') {
    const r = tag.raw as Record<string, unknown>
    return String(r.value ?? r.id ?? r.name ?? tag.name)
  }
  return tag.name
}

// ─── 下拉菜单 ─────────────────────────────────────────────────────────────────

const icon = (comp: unknown) => () => h(comp as Parameters<typeof h>[0], { size: 14 })

function menuFor(tag: TagItem): DropdownOption[] {
  const opts: DropdownOption[] = []
  if (props.editable) {
    opts.push({ key: 'apply-all',        label: '应用全部',  icon: icon(CheckCheck) })
    opts.push({ key: `apply:${tag.key}`, label: '仅应用此项', icon: icon(Check) })
    opts.push({ key: `edit:${tag.key}`,  label: '修改',      icon: icon(Pencil) })
    opts.push({ key: 'div1', type: 'divider' } as DropdownOption)
  }
  opts.push({ key: `copy:${tag.key}`,  label: '复制此项', icon: icon(Copy) })
  if (tagItems.value.length > 1) {
    opts.push({ key: 'copy-all', label: '复制全部', icon: icon(Files) })
  }
  return opts
}

function handleMenu(key: string, tag: TagItem) {
  if (key === 'apply-all') {
    emit('applyAll', props.data)
  } else if (key.startsWith('apply:')) {
    emit('select', tag.key, tag.raw as ContextDataItem)
  } else if (key.startsWith('edit:')) {
    openPicker(tag.key)
  } else if (key.startsWith('copy:')) {
    const json = JSON.stringify({ [tag.key]: rawValue(tag) }, null, 2)
    navigator.clipboard.writeText(json)
    message.success(`已复制`)
  } else if (key === 'copy-all') {
    const obj = Object.fromEntries(tagItems.value.map(t => [t.key, rawValue(t)]))
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
    message.success(`已复制 ${tagItems.value.length} 项`)
  }
}

// ─── DictPicker ───────────────────────────────────────────────────────────────

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

function onPickerSelect(item: ContextDataItem) {
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
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.ctx-tag:hover {
  background: #e0e7ff;
  color: #4f46e5;
}

.ctx-tag:hover .ctx-tag__key { color: #818cf8; }

.ctx-tag__key  { font-family: monospace; color: #94a3b8; }
.ctx-tag__sep  { color: #cbd5e1; margin: 0 1px; }
.ctx-tag__name { font-weight: 500; }
</style>
