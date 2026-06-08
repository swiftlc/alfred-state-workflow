<template>
  <n-dropdown
    :trigger="(trigger as any)"
    placement="bottom-start"
    :options="menuOptions"
    @select="handleSelect"
  >
    <span v-bind="$attrs" class="ctx-item" :class="{ 'ctx-item--bare': bare }">
      <slot />
    </span>
  </n-dropdown>

  <DictPicker
    v-if="fetchItems"
    v-model:show="pickerShow"
    :dict-key="contextKey"
    :dict-name="displayName"
    :fetch-items="fetchItems"
    :current-value="null"
    @select="onPickerSelect"
  />
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false })

import { ref, computed, inject, onMounted, onUnmounted, h } from 'vue'
import { NDropdown, useMessage } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { Layers, Check, Copy, Files, Pencil, Zap } from '@lucide/vue'
import DictPicker from '@/components/DictPicker.vue'
import { CTX_GROUP_KEY } from '@/composables/contextGroup'
import { getContext, setContext } from '@/api/alfred'
import { KEY_CONFIGS } from '@/config/contextKeyConfig'
import type { KeyActionDef } from '@/config/contextKeyConfig'
import type { FetchItemsFn } from '@/utils/dict'
import type { ContextDataItem } from '@/types'

export interface CopyOption { key: string; label: string; value: string; disabled?: boolean }

const props = withDefaults(defineProps<{
  contextKey:    string
  value:         string
  label?:        string
  dictName?:     string
  fetchItems?:   FetchItemsFn
  editable?:     boolean
  copyOptions?:  CopyOption[]
  extraActions?: KeyActionDef[]
  meta?:         Record<string, unknown>
  trigger?:      'click' | 'contextmenu'
  bare?:         boolean       // 禁用内置 hover ring，由 slot 内容自行处理视觉反馈
  customEdit?:   boolean       // picker 选中后只 emit 'edit'，不自动调 setContext
  editTarget?:   'picker' | 'custom'  // 'custom'：点"修改"时 emit 'edit:open' 而非打开 DictPicker
}>(), {
  editable:   true,
  trigger:    'click',
  bare:       false,
  customEdit: false,
  editTarget: 'picker',
})

const emit = defineEmits<{
  action:      [key: string]
  edit:        [item: ContextDataItem]  // picker 选中后触发；customEdit=true 时不走 setContext
  'edit:open': []                       // editTarget='custom' 时点"修改"触发
}>()

const message    = useMessage()
const pickerShow = ref(false)
const group      = inject(CTX_GROUP_KEY, null)

const keyConfig  = computed(() => KEY_CONFIGS[props.contextKey])

const displayName = computed(() =>
  props.dictName || props.label || keyConfig.value?.displayName || props.contextKey
)

const resolvedCopyOptions = computed(() => {
  if (props.copyOptions?.length) return props.copyOptions
  return keyConfig.value?.copyOptions?.(props.value, props.meta) ?? []
})

const icon = (comp: unknown) => () => h(comp as Parameters<typeof h>[0], { size: 13 })

const COPY_PFX   = 'copy:'
const ACTION_PFX = 'action:'

const menuOptions = computed<DropdownOption[]>(() => {
  const count = group?.itemCount() ?? 0
  const opts: DropdownOption[] = []

  // ── 通用：应用类 ──────────────────────────────────────────────────────────
  if (props.editable) {
    if (count > 2) {
      opts.push({ key: 'batch-apply', label: '批量应用', icon: icon(Layers) })
    }
    opts.push({ key: 'apply', label: count <= 1 ? '应用此项' : '仅应用此项', icon: icon(Check) })
    if (props.fetchItems || props.editTarget === 'custom') {
      opts.push({ key: 'edit', label: '修改', icon: icon(Pencil) })
    }
    opts.push({ key: '__div', type: 'divider' } as DropdownOption)
  }

  // ── 通用：复制类 ──────────────────────────────────────────────────────────
  if (resolvedCopyOptions.value.length) {
    opts.push({
      key:      '__copy_group',
      label:    '复制此项',
      icon:     icon(Copy),
      children: resolvedCopyOptions.value.map(o => ({
        key:      `${COPY_PFX}${o.key}`,
        label:    o.label,
        disabled: o.disabled,
      })),
    })
  } else {
    opts.push({ key: 'copy', label: '复制此项', icon: icon(Copy) })
  }
  if (count === 2) {
    opts.push({ key: 'copy-all',    label: '复制全部',  icon: icon(Files) })
  } else if (count > 2) {
    opts.push({ key: 'batch-copy',  label: '批量复制',  icon: icon(Files) })
  }

  // ── 专属扩展：props（view-specific）+ KEY_CONFIGS（全局）合并 ──────────────
  const extraActions = [...(props.extraActions ?? []), ...(keyConfig.value?.extraActions ?? [])]
  if (extraActions.length) {
    opts.push({ key: '__div2', type: 'divider' } as DropdownOption)
    for (const act of extraActions) {
      opts.push({ key: `${ACTION_PFX}${act.key}`, label: act.label, icon: icon(Zap), disabled: act.disabled })
    }
  }

  return opts
})

async function handleSelect(key: string) {
  if (key === 'batch-apply') {
    group?.openBatch('apply')
  } else if (key === 'batch-copy') {
    group?.openBatch('copy')
  } else if (key === 'copy-all') {
    group?.copyAll()
  } else if (key === 'apply') {
    const item: ContextDataItem = { id: props.value, name: props.value, value: props.value }
    const current = await getContext()
    await setContext({ state: current?.state ?? 'home', data: { ...current?.data, [props.contextKey]: item } })
    message.success(`已将 ${displayName.value} 设为上下文`)
  } else if (key === 'edit') {
    if (props.editTarget === 'custom') emit('edit:open')
    else pickerShow.value = true
  } else if (key === 'copy') {
    await navigator.clipboard.writeText(props.value)
    message.success(`已复制${props.label ? ' ' + props.label : ''}`)
  } else if (key.startsWith(COPY_PFX)) {
    const copyKey = key.slice(COPY_PFX.length)
    const opt     = resolvedCopyOptions.value.find(o => o.key === copyKey)
    if (opt?.value !== undefined) {
      await navigator.clipboard.writeText(opt.value)
      message.success(`已复制`)
    }
  } else if (key.startsWith(ACTION_PFX)) {
    const actionKey = key.slice(ACTION_PFX.length)
    keyConfig.value?.onAction?.(actionKey, props.value, props.meta)
    emit('action', actionKey)
  }
}

async function onPickerSelect(item: ContextDataItem) {
  emit('edit', item)
  if (!props.customEdit) {
    const current = await getContext()
    await setContext({ state: current?.state ?? 'home', data: { ...current?.data, [props.contextKey]: item } })
    message.success(`已将 ${displayName.value} 设为上下文`)
  }
}

// ─── 分组注册 ──────────────────────────────────────────────────────────────────

onMounted(() => {
  group?.registerItem({
    contextKey: props.contextKey,
    getValue:   () => props.value,
    label:      props.label,
  })
})

onUnmounted(() => {
  group?.unregisterItem(props.contextKey)
})
</script>

<style scoped>
.ctx-item {
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  cursor: pointer;
  transition: box-shadow 0.1s ease, background 0.1s ease;
}

.ctx-item:hover {
  box-shadow: 0 0 0 2px rgba(91, 106, 240, 0.2);
  background: rgba(91, 106, 240, 0.04);
}
.ctx-item--bare:hover {
  box-shadow: none;
  background: transparent;
}
</style>
