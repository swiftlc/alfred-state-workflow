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

    <n-modal v-model:show="batchModal.show" :mask-closable="true" :auto-focus="false">
      <div class="batch-wrap">
        <div class="batch-header">
          <span class="batch-title">{{ batchModal.mode === 'apply' ? '选择要应用的上下文项' : '选择要复制的上下文项' }}</span>
          <span class="batch-sub">已选 {{ batchModal.selected.size }} / {{ tagItems.length }} 项</span>
        </div>
        <div class="batch-body">
          <span class="batch-selall" @click="toggleSelectAll">
            {{ batchModal.selected.size === tagItems.length ? '取消全选' : '全选' }}
          </span>
          <div
            v-for="tag in tagItems"
            :key="tag.key"
            class="batch-item"
            @click="toggleBatchItem(tag.key)"
          >
            <n-checkbox
              :checked="batchModal.selected.has(tag.key)"
              @update:checked="() => toggleBatchItem(tag.key)"
              @click.stop
              style="margin-top:2px;flex-shrink:0"
            />
            <span class="batch-item__label" :class="{ 'batch-item__label--off': !batchModal.selected.has(tag.key) }">
              <span class="batch-item__key">{{ tag.dictName }}</span>
              <span class="batch-item__name" :title="tag.name">{{ tag.name }}</span>
            </span>
          </div>
        </div>
        <div class="batch-footer">
          <n-button size="small" @click="batchModal.show = false">取消</n-button>
          <n-button
            size="small"
            type="primary"
            :disabled="batchModal.selected.size === 0"
            @click="confirmBatch"
          >
            {{ batchModal.mode === 'apply' ? '应用已选' : '复制已选' }} ({{ batchModal.selected.size }})
          </n-button>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, h } from 'vue'
import { NDropdown, NModal, NCheckbox, NButton, useMessage } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { Layers, Check, Pencil, Copy, Files, Zap } from '@lucide/vue'
import DictPicker from '@/components/DictPicker.vue'
import { READONLY_DICTS } from '@/config/dicts'
import { makeFetchItems } from '@/utils/dict'
import { KEY_CONFIGS } from '@/config/contextKeyConfig'
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
    const count = tagItems.value.length
    if (count > 2) {
      opts.push({ key: 'batch-apply', label: '批量应用', icon: icon(Layers) })
    }
    opts.push({ key: `apply:${tag.key}`, label: count === 1 ? '应用此项' : '仅应用此项', icon: icon(Check) })
    opts.push({ key: `edit:${tag.key}`,  label: '修改',      icon: icon(Pencil) })
    opts.push({ key: 'div1', type: 'divider' } as DropdownOption)
  }
  opts.push({ key: `copy:${tag.key}`,  label: '复制此项', icon: icon(Copy) })
  const total = tagItems.value.length
  if (total === 2) {
    opts.push({ key: 'copy-all',    label: '复制全部',  icon: icon(Files) })
  } else if (total > 2) {
    opts.push({ key: 'batch-copy', label: '批量复制', icon: icon(Files) })
  }
  const extraActions = KEY_CONFIGS[tag.key]?.extraActions ?? []
  if (extraActions.length) {
    opts.push({ key: 'div2', type: 'divider' } as DropdownOption)
    for (const act of extraActions) {
      opts.push({ key: `action:${tag.key}:${act.key}`, label: act.label, icon: icon(Zap), disabled: act.disabled })
    }
  }
  return opts
}

function handleMenu(key: string, tag: TagItem) {
  if (key === 'batch-apply') {
    openBatchModal('apply')
  } else if (key === 'batch-copy') {
    openBatchModal('copy')
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
  } else if (key.startsWith('action:')) {
    const parts = key.split(':')
    const dictKey   = parts[1]
    const actionKey = parts.slice(2).join(':')
    const tagValue  = rawValue(tag)
    KEY_CONFIGS[dictKey]?.onAction?.(actionKey, tagValue)
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

// ─── 批量应用 Modal ───────────────────────────────────────────────────────────

const batchModal = reactive({
  show:     false,
  selected: new Set<string>(),
  mode:     'apply' as 'apply' | 'copy',
})

function openBatchModal(mode: 'apply' | 'copy') {
  batchModal.mode     = mode
  batchModal.selected = new Set(tagItems.value.map(t => t.key))
  batchModal.show     = true
}

function toggleBatchItem(key: string) {
  if (batchModal.selected.has(key)) batchModal.selected.delete(key)
  else batchModal.selected.add(key)
}

function toggleSelectAll() {
  if (batchModal.selected.size === tagItems.value.length)
    batchModal.selected.clear()
  else
    batchModal.selected = new Set(tagItems.value.map(t => t.key))
}

function confirmBatch() {
  const keys = [...batchModal.selected]
  if (batchModal.mode === 'apply') {
    const subset = Object.fromEntries(keys.map(k => [k, props.data[k]]))
    emit('applyAll', subset)
  } else {
    const selectedTags = tagItems.value.filter(t => batchModal.selected.has(t.key))
    const obj = Object.fromEntries(selectedTags.map(t => [t.key, rawValue(t)]))
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
    message.success(`已复制 ${keys.length} 项`)
  }
  batchModal.show = false
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

/* ── 批量应用 Modal ── */
.batch-wrap {
  min-width: 280px;
  max-width: min(500px, 90vw);
  width: max-content;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06);
  overflow: hidden;
}

.batch-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 20px 13px;
  border-bottom: 1px solid #f1f5f9;
}

.batch-title { font-size: 13px; font-weight: 600; color: #0f172a; white-space: nowrap; }
.batch-sub   { font-size: 11px; color: #94a3b8; white-space: nowrap; }

.batch-body {
  padding: 6px 0;
  max-height: 260px;
  overflow-y: auto;
}

.batch-selall {
  display: block;
  padding: 3px 20px 7px;
  font-size: 11px;
  color: #4f46e5;
  cursor: pointer;
  user-select: none;
}
.batch-selall:hover { text-decoration: underline; }

.batch-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 20px;
  cursor: pointer;
  transition: background 0.08s;
}
.batch-item:hover { background: #f8fafc; }

.batch-item__label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #374151;
}
.batch-item__label--off { color: #9ca3af; }

.batch-item__key  { font-family: monospace; font-size: 10px; color: #94a3b8; line-height: 1.3; }
.batch-item__name { font-size: 12px; font-weight: 500; line-height: 1.4; word-break: break-all; }

.batch-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #f1f5f9;
}
</style>
