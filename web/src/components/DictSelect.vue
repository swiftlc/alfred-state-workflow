<template>
  <div class="dict-select" :class="{ 'is-active': pickerVisible }">
    <div class="dict-select__trigger" @click="pickerVisible = true">
      <span v-if="displayLabel" class="dict-select__value">{{ displayLabel }}</span>
      <span v-else class="dict-select__placeholder">{{ placeholder || '请选择…' }}</span>

      <div class="dict-select__suffix">
        <span
          v-if="clearable && modelValue != null && modelValue !== ''"
          class="dict-select__clear"
          @click.stop="onClear"
        >
          <X :size="11" />
        </span>
        <ChevronDown
          :size="13"
          class="dict-select__arrow"
          :class="{ 'dict-select__arrow--open': pickerVisible }"
        />
      </div>
    </div>

    <DictPicker
      :show="pickerVisible"
      :dict-key="dictKey"
      :dict-name="dictName || dictKey"
      :fetch-items="fetchAndCache"
      :current-value="currentItem"
      :allow-input="allowInput"
      @update:show="pickerVisible = $event"
      @select="onSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, X } from '@lucide/vue'
import DictPicker from './DictPicker.vue'
import type { DictItem, ContextDataItem } from '@/types'

const props = defineProps<{
  modelValue: string | null | undefined
  dictKey: string
  fetchItems: () => Promise<DictItem[]>
  dictName?: string
  placeholder?: string
  clearable?: boolean
  allowInput?: boolean  // 传给 DictPicker，默认 true（支持手动输入）
}>()

const emit = defineEmits<{
  'update:modelValue': [val: string | null]
}>()

const pickerVisible = ref(false)
const cachedItems   = ref<DictItem[]>([])

const displayLabel = computed(() => {
  const v = props.modelValue
  if (v == null || v === '') return null
  const found = cachedItems.value.find(i => i.value === v)
  return found ? found.name : v
})

const currentItem = computed<ContextDataItem | null>(() => {
  const v = props.modelValue
  if (v == null) return null
  const found = cachedItems.value.find(i => i.value === v)
  return found
    ? { id: found.id, name: found.name, value: found.value }
    : { id: v, name: v, value: v }
})

async function fetchAndCache(): Promise<DictItem[]> {
  const items     = await props.fetchItems()
  cachedItems.value = items
  return items
}

function onSelect(item: ContextDataItem) {
  emit('update:modelValue', item.value ?? null)
}

function onClear() {
  emit('update:modelValue', null)
}
</script>

<style scoped>
.dict-select {
  display: inline-flex;
  width: 100%;
  position: relative;
}

.dict-select__trigger {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 34px;
  padding: 0 10px 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  gap: 6px;
  transition: border-color 0.15s, box-shadow 0.15s;
  font-size: 13.5px;
  color: #374151;
  user-select: none;
}

.dict-select__trigger:hover {
  border-color: #a5adde;
}

.dict-select.is-active .dict-select__trigger {
  border-color: #5b6af0;
  box-shadow: 0 0 0 3px rgba(91, 106, 240, 0.12);
}

.dict-select__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dict-select__placeholder {
  flex: 1;
  min-width: 0;
  color: #c0c4cc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dict-select__suffix {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  color: #c0c4cc;
}

.dict-select__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.dict-select__clear:hover {
  background: #f1f5f9;
  color: #64748b;
}

.dict-select__arrow {
  transition: transform 0.2s;
}
.dict-select__arrow--open {
  transform: rotate(180deg);
}
</style>
