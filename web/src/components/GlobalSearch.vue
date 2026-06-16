<template>
  <n-modal
    v-model:show="innerShow"
    :mask-closable="true"
    :auto-focus="false"
    transform-origin="center"
    @after-leave="reset"
  >
    <div class="gs-wrap" @keydown.esc="innerShow = false">

      <!-- 搜索框 -->
      <div class="gs-search">
        <component :is="Search" :size="18" class="gs-search__icon" />
        <input
          ref="inputRef"
          v-model="query"
          class="gs-search__input"
          placeholder="搜索页面、别名、历史记录、导航…"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter.prevent="onEnter"
          @keydown.up.prevent="move(-1)"
          @keydown.down.prevent="move(1)"
          @keydown.esc="innerShow = false"
        />
        <kbd class="gs-esc" @click="innerShow = false">esc</kbd>
      </div>

      <!-- 结果列表 -->
      <div ref="listRef" class="gs-list">

        <!-- 加载中 -->
        <div v-if="loading" class="gs-empty"><n-spin size="small" /></div>

        <template v-else>
          <!-- 无结果 -->
          <div v-if="results.length === 0" class="gs-empty">
            {{ query.trim() ? `未找到「${query}」` : '输入关键词开始搜索' }}
          </div>

          <!-- 分组标题（无搜索词时显示分组） -->
          <template v-for="group in groupedResults" :key="group.type">
            <div v-if="!query.trim()" class="gs-group-label">{{ group.label }}</div>
            <div
              v-for="item in group.items"
              :key="item.id"
              :ref="el => setRef(el as HTMLElement | null, item._flatIdx ?? 0)"
              class="gs-item"
              :class="{ 'is-active': cursor === (item._flatIdx ?? 0) }"
              @click="select(item)"
              @mouseenter="cursor = item._flatIdx ?? 0"
            >
              <!-- 图标 -->
              <span class="gs-item__icon" :style="{ background: typeColor(item.type).bg }">
                <component :is="item.icon" :size="15" :style="{ color: typeColor(item.type).fg }" />
              </span>

              <!-- 文字 -->
              <span class="gs-item__body">
                <span class="gs-item__name">{{ item.title }}</span>
                <span v-if="item.subtitle" class="gs-item__sub">{{ item.subtitle }}</span>
              </span>

              <!-- 类型 badge -->
              <span class="gs-item__badge" :style="{ background: typeColor(item.type).bg, color: typeColor(item.type).fg }">
                {{ typeLabel(item.type) }}
              </span>

              <!-- Enter 提示 -->
              <component :is="CornerDownLeft" v-if="cursor === (item._flatIdx ?? 0)" :size="12" class="gs-item__enter" />
            </div>
          </template>
        </template>
      </div>

      <!-- footer 快捷键提示 -->
      <div class="gs-footer">
        <span class="gs-footer__hint"><kbd>↑↓</kbd> 导航</span>
        <span class="gs-footer__hint"><kbd>↩</kbd> 打开</span>
        <span class="gs-footer__hint"><kbd>esc</kbd> 关闭</span>
        <div class="flex-1" />
        <span class="gs-footer__tip">⌘K 随时唤起</span>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search, CornerDownLeft,
  BookOpen, History, Layers, Zap, Activity, BarChart2, Sliders, Network, Terminal, Radio, Gamepad2,
  FileCode2, Clock, Command, FolderOpen,
} from '@lucide/vue'
import { NModal, NSpin } from 'naive-ui'
import { matchQuery } from '@/utils/search'
import { usePlayground } from '@/composables/usePlayground'
import { getHistory, getAliases, getWorkspaces } from '@/api/alfred'
import type { Component } from 'vue'

// ─────────────────────────────────────────────────────────────────────────────

type ResultType = 'nav' | 'playground' | 'alias' | 'history' | 'workspace'

interface SearchResult {
  id:        string
  type:      ResultType
  title:     string
  subtitle?: string
  icon:      Component
  action:    () => void
  _flatIdx?: number   // filled at render time
}

interface ResultGroup {
  type:  ResultType
  label: string
  items: SearchResult[]
}

// ─────────────────────────────────────────────────────────────────────────────

const props = defineProps<{ show: boolean }>()
const emit  = defineEmits<{ 'update:show': [v: boolean] }>()

const innerShow = computed({
  get: () => props.show,
  set: v => emit('update:show', v),
})

const router   = useRouter()
const { pages } = usePlayground()

const query    = ref('')
const loading  = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef  = ref<HTMLElement | null>(null)
const itemRefs = ref<(HTMLElement | null)[]>([])
const cursor   = ref(0)

// ── 懒加载的远端数据 ──────────────────────────────────────────────────────────
const remoteHistory    = ref<{ id: string; title: string; subtitle?: string }[]>([])
const remoteAliases    = ref<{ id: string; title: string; alias: string; subtitle?: string }[]>([])
const remoteWorkspaces = ref<{ id: string; name: string }[]>([])

async function loadRemote() {
  loading.value = true
  try {
    const [h, a, w] = await Promise.all([
      getHistory().catch(() => []),
      getAliases().catch(()  => []),
      getWorkspaces().catch(() => []),
    ])
    remoteHistory.value    = (h as any[]).slice(0, 20)
    remoteAliases.value    = (a as any[]).slice(0, 30)
    remoteWorkspaces.value = (w as any[]).slice(0, 20)
  } finally {
    loading.value = false
  }
}

// ── 静态导航项 ────────────────────────────────────────────────────────────────
function makeNavResults(): SearchResult[] {
  const defs: Omit<SearchResult, '_flatIdx'>[] = [
    { id: 'nav-dicts',      type: 'nav', title: '字典管理',    subtitle: '查看和编辑所有字典',           icon: BookOpen,  action: () => { router.push('/dicts') } },
    { id: 'nav-history',    type: 'nav', title: '历史记录',    subtitle: '最近执行过的操作',             icon: History,   action: () => { router.push('/history') } },
    { id: 'nav-workspaces', type: 'nav', title: '工作区',      subtitle: '保存和切换上下文快照',         icon: Layers,    action: () => { router.push('/workspaces') } },
    { id: 'nav-aliases',    type: 'nav', title: '别名',        subtitle: '快速触发常用操作',             icon: Zap,       action: () => { router.push('/aliases') } },
    { id: 'nav-context',    type: 'nav', title: '上下文',      subtitle: '查看和编辑当前 Alfred 上下文', icon: Activity,  action: () => { router.push('/context') } },
    { id: 'nav-monitor',    type: 'nav', title: '环境嗅探',    subtitle: '剪贴板和文件感知',             icon: BarChart2, action: () => { router.push('/monitor') } },
    { id: 'nav-lion',       type: 'nav', title: 'Lion 配置',   subtitle: '查看和修改 Lion 配置项',       icon: Sliders,   action: () => { router.push('/lion') } },
    { id: 'nav-shepherd',   type: 'nav', title: 'Shepherd',    subtitle: '网关接口管理',                 icon: Network,   action: () => { router.push('/shepherd') } },
    { id: 'nav-octo',       type: 'nav', title: 'Octo RPC',    subtitle: 'RPC 服务调用',                 icon: Terminal,  action: () => { router.push('/octo') } },
    { id: 'nav-mafka',      type: 'nav', title: 'Mafka',       subtitle: 'Kafka 消息查询和发送',         icon: Radio,     action: () => { router.push('/mafka') } },
    { id: 'nav-playground', type: 'nav', title: 'Playground',  subtitle: '搭建自定义数据页面',           icon: Gamepad2,  action: () => { router.push('/playground') } },
  ]
  return defs.map((r, i) => ({ ...r, _flatIdx: i }))
}
const NAV_RESULTS = computed(makeNavResults)

// ── 所有结果 ──────────────────────────────────────────────────────────────────
const results = computed((): SearchResult[] => {
  const q = query.value.trim().toLowerCase()

  const pg: SearchResult[] = pages.value.map(p => ({
    id:       `pg-${p.id}`,
    type:     'playground' as const,
    title:    p.name,
    subtitle: 'Playground 页面',
    icon:     FileCode2,
    action:   () => router.push(`/playground/${p.id}`),
    _flatIdx: 0,
  }))

  const his: SearchResult[] = remoteHistory.value.map(h => ({
    id:       `his-${h.id}`,
    type:     'history' as const,
    title:    h.title,
    subtitle: h.subtitle ?? '历史记录',
    icon:     Clock,
    action:   () => router.push('/history'),
    _flatIdx: 0,
  }))

  const ali: SearchResult[] = remoteAliases.value.map(a => ({
    id:       `ali-${a.id}`,
    type:     'alias' as const,
    title:    a.title || a.alias,
    subtitle: `别名：${a.alias}`,
    icon:     Command,
    action:   () => router.push('/aliases'),
    _flatIdx: 0,
  }))

  const wks: SearchResult[] = remoteWorkspaces.value.map(w => ({
    id:       `wks-${w.id}`,
    type:     'workspace' as const,
    title:    w.name,
    subtitle: '工作区',
    icon:     FolderOpen,
    action:   () => router.push('/workspaces'),
    _flatIdx: 0,
  }))

  const all = [...NAV_RESULTS.value, ...pg, ...his, ...ali, ...wks]

  const filtered = q
    ? all.filter(r => matchQuery(q, r.title, r.subtitle))
    : all

  // 分配 flatIdx
  return filtered.map((r, i) => ({ ...r, _flatIdx: i }))
})

// ── 分组（无搜索词时按类型分组，有词时不分组直接全显示） ────────────────────────
const groupedResults = computed((): ResultGroup[] => {
  const q = query.value.trim()
  if (q) {
    return [{ type: 'nav', label: '搜索结果', items: results.value }]
  }
  const groups: { type: ResultType; label: string }[] = [
    { type: 'nav',        label: '快速导航' },
    { type: 'playground', label: 'Playground 页面' },
    { type: 'alias',      label: '别名' },
    { type: 'workspace',  label: '工作区' },
    { type: 'history',    label: '最近历史' },
  ]
  return groups
    .map(g => ({ ...g, items: results.value.filter(r => r.type === g.type) }))
    .filter(g => g.items.length > 0)
})

// ── 类型样式 ──────────────────────────────────────────────────────────────────
function typeColor(type: ResultType) {
  const map: Record<ResultType, { bg: string; fg: string }> = {
    nav:        { bg: '#f1f5f9', fg: '#475569' },
    playground: { bg: '#eef2ff', fg: '#5b6af0' },
    alias:      { bg: '#d1fae5', fg: '#059669' },
    history:    { bg: '#fef3c7', fg: '#b45309' },
    workspace:  { bg: '#ede9fe', fg: '#7c3aed' },
  }
  return map[type]
}

function typeLabel(type: ResultType) {
  return { nav: '导航', playground: '页面', alias: '别名', history: '历史', workspace: '工作区' }[type]
}

// ── 键盘导航 ──────────────────────────────────────────────────────────────────
function setRef(el: HTMLElement | null, idx: number) {
  itemRefs.value[idx] = el
}

function move(dir: number) {
  const max = results.value.length - 1
  if (max < 0) return
  let next = cursor.value + dir
  if (next > max) next = 0
  if (next < 0)   next = max
  cursor.value = next
  nextTick(() => itemRefs.value[next]?.scrollIntoView({ block: 'nearest' }))
}

function onEnter() {
  const item = results.value[cursor.value]
  if (item) select(item)
}

function select(item: SearchResult) {
  item.action()
  innerShow.value = false
}

// ── 打开时加载数据 ────────────────────────────────────────────────────────────
watch(() => props.show, async v => {
  if (v) {
    query.value  = ''
    cursor.value = 0
    itemRefs.value = []
    await loadRemote()
    await nextTick()
    inputRef.value?.focus()
  }
})

watch(query, () => {
  cursor.value   = 0
  itemRefs.value = []
})

function reset() {
  query.value    = ''
  cursor.value   = 0
  itemRefs.value = []
  remoteHistory.value    = []
  remoteAliases.value    = []
  remoteWorkspaces.value = []
}
</script>

<style scoped>
/* ── 外壳（与 DictPicker 风格一致） ── */
.gs-wrap {
  width: 600px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.20), 0 0 0 1px rgba(0,0,0,0.06);
  overflow: hidden;
  outline: none;
  align-self: flex-start;
  margin-top: 10vh;
}

/* ── 搜索框 ── */
.gs-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  height: 60px;
  border-bottom: 1px solid #f1f5f9;
}
.gs-search__icon { color: #94a3b8; flex-shrink: 0 }
.gs-search__input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 17px;
  font-weight: 400;
  color: #0f172a;
  background: transparent;
  caret-color: #6366f1;
}
.gs-search__input::placeholder { color: #cbd5e1 }

.gs-esc {
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.1s;
  user-select: none;
}
.gs-esc:hover { background: #e2e8f0 }

/* ── 列表 ── */
.gs-list {
  max-height: 440px;
  overflow-y: auto;
  padding: 6px 0;
}

/* ── 分组标签 ── */
.gs-group-label {
  padding: 8px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── 列表项 ── */
.gs-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.08s;
}
.gs-item.is-active { background: #f8f9ff }

.gs-item__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.gs-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.gs-item__name {
  font-size: 13.5px;
  font-weight: 500;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gs-item.is-active .gs-item__name { color: #3730a3 }
.gs-item__sub {
  font-size: 11.5px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gs-item__badge {
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 5px;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

.gs-item__enter {
  color: #c7d2fe;
  flex-shrink: 0;
  margin-left: 2px;
}

/* ── 空状态 ── */
.gs-empty {
  text-align: center;
  padding: 32px 0;
  color: #94a3b8;
  font-size: 13px;
}

/* ── Footer ── */
.gs-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-top: 1px solid #f1f5f9;
  background: #fafafa;
}
.gs-footer__hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
}
.gs-footer__hint kbd {
  font-size: 10px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 3px;
  padding: 1px 4px;
  font-family: inherit;
}
.gs-footer__tip {
  font-size: 11px;
  color: #cbd5e1;
}
.flex-1 { flex: 1 }
</style>
