<template>
  <slot />

  <n-modal v-model:show="batchModal.show" :mask-closable="true" :auto-focus="false">
    <div class="batch-wrap">
      <div class="batch-header">
        <span class="batch-title">{{ batchModal.mode === 'apply' ? '选择要应用的上下文项' : '选择要复制的上下文项' }}</span>
        <span class="batch-sub">已选 {{ batchModal.selected.size }} / {{ items.length }} 项</span>
      </div>

      <div class="batch-body">
        <span class="batch-selall" @click="toggleSelectAll">
          {{ batchModal.selected.size === items.length ? '取消全选' : '全选' }}
        </span>
        <div
          v-for="item in items" :key="item.contextKey"
          class="batch-item"
          @click="toggleItem(item.contextKey)"
        >
          <n-checkbox
            :checked="batchModal.selected.has(item.contextKey)"
            style="margin-top:2px; flex-shrink:0"
            @click.stop
          />
          <span class="batch-item__label" :class="{ 'batch-item__label--off': !batchModal.selected.has(item.contextKey) }">
            <span class="batch-item__key">{{ item.label || item.contextKey }}</span>
            <span class="batch-item__name" :title="item.getValue()">{{ item.getValue() }}</span>
          </span>
        </div>
      </div>

      <div class="batch-footer">
        <n-button size="small" @click="batchModal.show = false">取消</n-button>
        <n-button
          size="small" type="primary"
          :disabled="batchModal.selected.size === 0"
          @click="confirmBatch"
        >
          {{ batchModal.mode === 'apply' ? '应用已选' : '复制已选' }} ({{ batchModal.selected.size }})
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, reactive, provide } from 'vue'
import { NModal, NButton, NCheckbox, useMessage } from 'naive-ui'
import { CTX_GROUP_KEY, type GroupItemDef } from '@/composables/contextGroup'
import { getContext, setContext } from '@/api/alfred'
import type { ContextDataItem } from '@/types'

const message = useMessage()
const items   = ref<GroupItemDef[]>([])

function registerItem(def: GroupItemDef) {
  const idx = items.value.findIndex(i => i.contextKey === def.contextKey)
  if (idx >= 0) items.value[idx] = def
  else items.value.push(def)
}

function unregisterItem(contextKey: string) {
  items.value = items.value.filter(i => i.contextKey !== contextKey)
}

const batchModal = reactive({ show: false, selected: new Set<string>(), mode: 'apply' as 'apply' | 'copy' })

function openBatch(mode: 'apply' | 'copy' = 'apply') {
  batchModal.mode     = mode
  batchModal.selected = new Set(items.value.map(i => i.contextKey))
  batchModal.show     = true
}

function toggleItem(key: string) {
  if (batchModal.selected.has(key)) batchModal.selected.delete(key)
  else batchModal.selected.add(key)
}

function toggleSelectAll() {
  if (batchModal.selected.size === items.value.length)
    batchModal.selected.clear()
  else
    batchModal.selected = new Set(items.value.map(i => i.contextKey))
}

async function confirmBatch() {
  if (batchModal.mode === 'copy') {
    const obj: Record<string, string> = {}
    for (const key of batchModal.selected) {
      const def = items.value.find(i => i.contextKey === key)
      if (def) obj[key] = def.getValue()
    }
    await navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
    message.success(`已复制 ${batchModal.selected.size} 项`)
  } else {
    const current = await getContext()
    const patch: Record<string, ContextDataItem> = {}
    for (const key of batchModal.selected) {
      const def = items.value.find(i => i.contextKey === key)
      if (!def) continue
      const v = def.getValue()
      patch[key] = { id: v, name: v, value: v }
    }
    await setContext({ state: current?.state ?? 'home', data: { ...current?.data, ...patch } })
    message.success(`已应用 ${batchModal.selected.size} 项到上下文`)
  }
  batchModal.show = false
}

async function copyAll() {
  const obj: Record<string, string> = {}
  for (const i of items.value) obj[i.contextKey] = i.getValue()
  await navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
  message.success(`已复制 ${items.value.length} 项`)
}

provide(CTX_GROUP_KEY, {
  registerItem,
  unregisterItem,
  openBatch,
  copyAll,
  itemCount: () => items.value.length,
})
</script>

<style scoped>
.batch-wrap {
  min-width: 300px;
  max-width: min(480px, 90vw);
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
.batch-body  { padding: 6px 0; max-height: 300px; overflow-y: auto; }
.batch-selall {
  display: block;
  padding: 3px 20px 7px;
  font-size: 11px; color: #4f46e5; cursor: pointer; user-select: none;
}
.batch-selall:hover { text-decoration: underline; }
.batch-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 20px; cursor: pointer; transition: background 0.08s;
}
.batch-item:hover { background: #f8fafc; }
.batch-item__label {
  display: flex; flex-direction: column; gap: 2px;
  color: #374151; min-width: 0;
}
.batch-item__label--off { color: #9ca3af; }
.batch-item__key  { font-family: monospace; font-size: 10px; color: #94a3b8; line-height: 1.3; }
.batch-item__name { font-size: 12px; font-weight: 500; line-height: 1.4; word-break: break-all; }
.batch-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid #f1f5f9;
}
</style>
