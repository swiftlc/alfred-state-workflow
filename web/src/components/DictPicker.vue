<template>
  <n-modal
    v-model:show="innerShow"
    :mask-closable="true"
    :show-icon="false"
    :auto-focus="false"
    transform-origin="center"
    @after-leave="resetState"
    @keydown.esc.native="innerShow = false"
  >
    <div class="alfred-wrap" @keydown.esc="innerShow = false">
      <!-- 搜索框 -->
      <div class="alfred-search">
        <component :is="Search" :size="18" class="alfred-search__icon" />
        <input
          ref="inputRef"
          v-model="search"
          class="alfred-search__input"
          :placeholder="`搜索 ${dictName}...`"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter="onEnter"
          @keydown.up.prevent="moveCursor(-1)"
          @keydown.down.prevent="moveCursor(1)"
          @keydown.esc="innerShow = false"
        />
        <button
          v-if="fetchItems.clearCache"
          class="alfred-search__refresh"
          :class="{ 'is-spinning': refreshing }"
          :disabled="refreshing"
          title="刷新（清除缓存）"
          @click="handleRefresh"
        >
          <component :is="RefreshCw" :size="14" />
        </button>
        <kbd class="alfred-search__esc" @click="innerShow = false">esc</kbd>
      </div>

      <!-- 列表 -->
      <div ref="listRef" class="alfred-list">
        <div v-if="loading" class="alfred-empty">
          <n-spin size="small" />
        </div>
        <template v-else>
          <!-- 自定义输入项 -->
          <div
            v-if="search.trim() && allowInput !== false"
            class="alfred-item"
            :class="{ 'is-active': cursor === -1 }"
            @click="confirmManual"
            @mouseenter="cursor = -1"
          >
            <span class="alfred-item__icon alfred-item__icon--manual">
              <component :is="PencilLine" :size="15" />
            </span>
            <span class="alfred-item__body">
              <span class="alfred-item__name">使用「{{ search.trim() }}」</span>
              <span class="alfred-item__sub">自定义值</span>
            </span>
            <component :is="CornerDownLeft" :size="13" class="alfred-item__enter" />
          </div>

          <div v-if="!filteredItems.length && !search.trim()" class="alfred-empty">暂无数据</div>
          <div v-else-if="!filteredItems.length" class="alfred-empty">无匹配项</div>

          <div
            v-for="(item, idx) in filteredItems"
            :key="item.id"
            :ref="el => setItemRef(el, idx)"
            class="alfred-item"
            :class="{ 'is-active': cursor === idx }"
            @click="confirmItem(item)"
            @mouseenter="cursor = idx"
          >
            <span class="alfred-item__icon" :class="{ 'alfred-item__icon--selected': isSelected(item) }">
              <component :is="isSelected(item) ? Check : FileText" :size="15" />
            </span>
            <span class="alfred-item__body">
              <span class="alfred-item__name-row">
                <span class="alfred-item__name">{{ item.name }}</span>
                <span
                  v-for="tag in (item.tags ?? [])"
                  :key="tag.label"
                  class="alfred-item__tag"
                  :data-color="tag.color || 'indigo'"
                >{{ tag.label }}</span>
              </span>
              <span v-if="item.description" class="alfred-item__sub">{{ item.description }}</span>
              <span v-else-if="item.value && item.value !== item.name" class="alfred-item__sub">{{ item.value }}</span>
            </span>
            <component :is="CornerDownLeft" v-if="cursor === idx" :size="13" class="alfred-item__enter" />
          </div>
        </template>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Search, PencilLine, Check, FileText, CornerDownLeft, RefreshCw } from '@lucide/vue'
import { NModal, NSpin } from 'naive-ui'
import { matchQuery } from '@/utils/search'
import type { FetchItemsFn } from '@/utils/dict'
import type { DictItem, ContextDataItem } from '@/types'

const props = defineProps<{
  show: boolean
  dictKey: string
  dictName: string
  fetchItems: FetchItemsFn
  currentValue?: ContextDataItem | null
  allowInput?: boolean  // 是否允许手动输入（默认 true）
}>()

const emit = defineEmits<{
  'update:show': [val: boolean]
  select: [item: ContextDataItem]
}>()

const innerShow = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

const search     = ref('')
const loading    = ref(false)
const refreshing = ref(false)
const items    = ref<DictItem[]>([])
const cursor   = ref(-2)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef  = ref<HTMLElement | null>(null)
const itemRefs = ref<(HTMLElement | null)[]>([])

function setItemRef(el: unknown, idx: number) {
  itemRefs.value[idx] = el as HTMLElement | null
}

const filteredItems = computed(() => {
  const q = search.value.trim()
  if (!q) return items.value
  return items.value.filter(i => matchQuery(q, i.name, i.value, i.description))
})

function isSelected(item: DictItem) {
  return props.currentValue?.id === item.id || props.currentValue?.value === item.value
}

async function load() {
  loading.value = true
  items.value   = []
  try { items.value = await props.fetchItems() }
  finally { loading.value = false }
}

async function handleRefresh() {
  refreshing.value = true
  props.fetchItems.clearCache?.()
  await load()
  refreshing.value = false
}

watch(() => props.show, async (v) => {
  if (v) {
    search.value = ''
    cursor.value = -2
    await load()
    await nextTick()
    inputRef.value?.focus()
  }
})

function resetState() {
  search.value    = ''
  items.value     = []
  cursor.value    = -2
  itemRefs.value  = []
}

function moveCursor(dir: number) {
  const hasManual = !!(search.value.trim() && props.allowInput !== false)
  const min = hasManual ? -1 : 0
  const max = filteredItems.value.length - 1
  if (max < 0 && !hasManual) return

  let next: number
  if (cursor.value < min) {
    next = dir > 0 ? min : max
  } else {
    next = cursor.value + dir
    if (next > max) next = min
    else if (next < min) next = max
  }
  cursor.value = next
  nextTick(() => {
    const el = next >= 0 ? itemRefs.value[next] : null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function confirmItem(item: DictItem) {
  emit('select', { id: item.id, name: item.name, value: item.value, description: item.description })
  innerShow.value = false
}

function confirmManual() {
  const v = search.value.trim()
  if (!v) return
  emit('select', { id: v, name: v, value: v })
  innerShow.value = false
}

function onEnter() {
  if (cursor.value === -1 && props.allowInput !== false) { confirmManual(); return }
  const item = filteredItems.value[cursor.value >= 0 ? cursor.value : 0]
  if (item) confirmItem(item)
  else if (search.value.trim() && props.allowInput !== false) confirmManual()
}
</script>

<style scoped>
/* ── Alfred 外壳 ── */
.alfred-wrap {
  width: 580px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0,0,0,0.06);
  overflow: hidden;
  outline: none;
  align-self: flex-start;
  margin-top: 12vh;
}

/* ── 搜索框 ── */
.alfred-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  height: 58px;
  border-bottom: 1px solid #f1f5f9;
}

.alfred-search__icon {
  color: #94a3b8;
  flex-shrink: 0;
}

.alfred-search__input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 17px;
  font-weight: 400;
  color: #0f172a;
  background: transparent;
  caret-color: #6366f1;
}
.alfred-search__input::placeholder { color: #cbd5e1; }

.alfred-search__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.1s, color 0.1s;
  padding: 0;
}
.alfred-search__refresh:hover { background: #f1f5f9; color: #475569; }
.alfred-search__refresh:disabled { opacity: 0.4; cursor: not-allowed; }
.alfred-search__refresh.is-spinning svg {
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.alfred-search__esc {
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.1s;
}
.alfred-search__esc:hover { background: #e2e8f0; }

/* ── 列表 ── */
.alfred-list {
  max-height: 400px;
  overflow-y: auto;
  padding: 6px 0;
}

/* ── 列表项 ── */
.alfred-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  cursor: pointer;
  transition: background 0.08s;
}
.alfred-item.is-active {
  background: #4f46e5;
}
.alfred-item.is-active .alfred-item__name { color: #fff; }
.alfred-item.is-active .alfred-item__sub  { color: rgba(255,255,255,0.65); }
.alfred-item.is-active .alfred-item__icon { color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.15); }
.alfred-item.is-active .alfred-item__enter { color: rgba(255,255,255,0.6); }

.alfred-item__icon {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  color: #64748b;
  flex-shrink: 0;
}
.alfred-item__icon--selected { background: #eef2ff; color: #6366f1; }
.alfred-item__icon--manual   { background: #faf5ff; color: #7c3aed; }

.alfred-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.alfred-item__name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.alfred-item__name {
  font-size: 14px;
  font-weight: 500;
  color: #0f172a;
  line-height: 1.4;
  word-break: break-all;
}

.alfred-item__tag {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.5;
  flex-shrink: 0;
  background: #eef2ff;
  color: #4f46e5;
}
.alfred-item__tag[data-color="emerald"] { background: #d1fae5; color: #059669; }
.alfred-item__tag[data-color="amber"]   { background: #fef3c7; color: #b45309; }
.alfred-item__tag[data-color="slate"]   { background: #f1f5f9; color: #475569; }
.alfred-item__tag[data-color="rose"]    { background: #ffe4e6; color: #e11d48; }
.alfred-item.is-active .alfred-item__tag {
  background: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.9);
}

.alfred-item__sub {
  font-family: monospace;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
  word-break: break-all;
}

.alfred-item__enter {
  color: #cbd5e1;
  flex-shrink: 0;
}

/* ── 空状态 ── */
.alfred-empty {
  text-align: center;
  padding: 28px 0;
  color: #94a3b8;
  font-size: 13px;
}
</style>
