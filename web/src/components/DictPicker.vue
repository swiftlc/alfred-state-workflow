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
    <div class="alfred-wrap" :style="props.width ? { width: props.width } : {}" @keydown.esc="innerShow = false">
      <!-- 搜索框 -->
      <div class="alfred-search">
        <component :is="Search" :size="18" class="alfred-search__icon" />
        <input
          ref="inputRef"
          v-model="search"
          class="alfred-search__input"
          :placeholder="placeholder || `搜索 ${dictName}...`"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter="onEnter"
          @keydown.up.prevent="moveCursor(-1)"
          @keydown.down.prevent="moveCursor(1)"
          @keydown.esc="innerShow = false"
        />
        <!-- 搜索框右侧扩展区 -->
        <slot name="search-suffix" :search="search" :count="filteredItems.length" />
        <button
          v-if="fetchItems?.clearCache"
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
          <!-- 自定义输入项（仅 fetchItems 模式） -->
          <div
            v-if="fetchItems && search.trim() && allowInput !== false"
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
            @click="handleItemClick(item, idx)"
            @mouseenter="cursor = idx"
          >
            <!-- item slot：完全自定义条目内容 -->
            <slot
              name="item"
              :item="item"
              :is-active="cursor === idx"
              :is-selected="isSelected(item)"
              :close="() => { innerShow = false }"
            >
              <!-- 默认渲染 -->
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
            </slot>

            <!-- item-actions slot：条目右侧操作区，阻止事件冒泡到条目 click -->
            <span v-if="$slots['item-actions']" class="alfred-item__actions" @click.stop>
              <slot
                name="item-actions"
                :item="item"
                :is-active="cursor === idx"
                :close="() => { innerShow = false }"
              />
            </span>
          </div>
        </template>
      </div>

      <!-- footer slot -->
      <div v-if="$slots.footer" class="alfred-footer">
        <slot name="footer" :close="() => { innerShow = false }" />
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
  fetchItems?: FetchItemsFn          // 可选：外部传 items 时无需
  items?: DictItem[]                 // 可选：直接传数据，绕开 fetchItems 加载
  currentValue?: ContextDataItem | null
  allowInput?: boolean
  placeholder?: string               // 自定义搜索占位符
  width?: string                     // 自定义弹窗宽度，默认 580px
  searchFields?: (item: DictItem) => string[]  // 自定义搜索字段提取
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
const fetchedItems = ref<DictItem[]>([])
const cursor   = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef  = ref<HTMLElement | null>(null)
const itemRefs = ref<(HTMLElement | null)[]>([])

// 最终条目：优先使用外部传入的 items prop，否则用 fetchItems 拉取的结果
const allItems = computed(() => props.items ?? fetchedItems.value)

function setItemRef(el: unknown, idx: number) {
  itemRefs.value[idx] = el as HTMLElement | null
}

const filteredItems = computed(() => {
  const q = search.value.trim()
  if (!q) return allItems.value
  return allItems.value.filter(i => {
    const fields = props.searchFields
      ? props.searchFields(i)
      : [i.name, i.value, i.description, ...(i.tags?.map(t => t.label) ?? [])]
    return matchQuery(q, ...fields)
  })
})

function isSelected(item: DictItem) {
  return props.currentValue?.id === item.id || props.currentValue?.value === item.value
}

async function load() {
  if (!props.fetchItems) return
  loading.value = true
  fetchedItems.value = []
  try { fetchedItems.value = await props.fetchItems() }
  finally { loading.value = false }
}

async function handleRefresh() {
  if (!props.fetchItems) return
  refreshing.value = true
  props.fetchItems.clearCache?.()
  await load()
  refreshing.value = false
}

watch(() => props.show, async (v) => {
  if (v) {
    search.value = ''
    cursor.value = 0
    if (props.fetchItems) await load()
    await nextTick()
    inputRef.value?.focus()
  } else {
    // 立即重置，避免关闭动画期间高亮闪烁
    cursor.value = 0
    search.value = ''
  }
})

// 搜索内容变化时：始终高亮第一条，处理列表缩短/扩张的情况
watch(search, () => {
  cursor.value   = 0
  itemRefs.value = []
})

function resetState() {
  search.value       = ''
  fetchedItems.value = []
  cursor.value       = 0
  itemRefs.value     = []
}

function moveCursor(dir: number) {
  const hasManual = !!(props.fetchItems && search.value.trim() && props.allowInput !== false)
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

// 有 item slot 时，点击由 slot 内部处理；无 slot 时走默认 select 逻辑
function handleItemClick(item: DictItem, _idx: number) {
  // 如果外部没有自定义 item slot，走默认行为
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
  if (cursor.value === -1 && props.fetchItems && props.allowInput !== false) { confirmManual(); return }
  const idx  = Math.max(0, cursor.value)
  const item = filteredItems.value[idx]
  if (item) handleItemClick(item, idx)
  else if (props.fetchItems && search.value.trim() && props.allowInput !== false) confirmManual()
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
  background: #f1f5f9;
  color: #0f172a;
}
/* 默认渲染模式的子元素颜色 */
.alfred-item.is-active .alfred-item__name  { color: #0f172a; }
.alfred-item.is-active .alfred-item__sub   { color: #475569; }
.alfred-item.is-active .alfred-item__icon  { color: #475569; background: #e2e8f0; }
.alfred-item.is-active .alfred-item__enter { color: #94a3b8; }

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
.alfred-item.is-active .alfred-item__tag                    { background: #e0e7ff; color: #4338ca; }
.alfred-item.is-active .alfred-item__tag[data-color="emerald"] { background: #bbf7d0; color: #047857; }
.alfred-item.is-active .alfred-item__tag[data-color="amber"]   { background: #fde68a; color: #92400e; }
.alfred-item.is-active .alfred-item__tag[data-color="slate"]   { background: #cbd5e1; color: #334155; }
.alfred-item.is-active .alfred-item__tag[data-color="rose"]    { background: #fecdd3; color: #be123c; }

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

/* ── 条目操作区（item-actions slot） ── */
.alfred-item__actions {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.12s;
}
.alfred-item:hover .alfred-item__actions,
.alfred-item.is-active .alfred-item__actions {
  opacity: 1;
}

/* ── footer slot ── */
.alfred-footer {
  display: flex;
  align-items: center;
  border-top: 1px solid #f1f5f9;
  background: #fafafa;
  padding: 8px 16px;
  flex-shrink: 0;
}
</style>
