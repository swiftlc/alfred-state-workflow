<template>
  <div class="flex flex-col" style="height: calc(100vh - 80px)">
    <div class="flex items-center justify-between mb-5 shrink-0">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">Lion 动态配置</h1>
    </div>

    <!-- 搜索栏 -->
    <div class="flex items-center gap-2 mb-4 shrink-0">
      <n-select
        v-model:value="appkeyInput"
        :options="appkeyOptionsFull"
        filterable
        clearable
        tag
        class="flex-1"
        placeholder="com.sankuai.xxx"
        @keydown.enter.native="doSearch"
      />
      <n-button type="primary" :loading="loading" :disabled="!appkeyInput" @click="doSearch">
        查询
      </n-button>
    </div>

    <!-- 过滤栏（有结果时显示） -->
    <div v-if="allItems.length || loading" class="flex items-center gap-2 mb-3 shrink-0">
      <n-input
        v-model:value="filterRaw"
        size="small"
        placeholder="过滤 key / 名称 / 描述 / 值…"
        clearable
        style="flex: 1"
      />
      <n-select
        v-model:value="filterStatus"
        size="small"
        style="width: 116px"
        :options="STATUS_OPTS"
      />
      <span class="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
        <n-spin v-if="filterLoading" :size="12" />
        {{ filterLoading ? '搜索中…' : `${filteredItems.length} / ${allItems.length}` }}
      </span>
    </div>

    <!-- 结果表格 -->
    <n-data-table
      v-if="allItems.length || loading"
      :columns="columns"
      :data="filteredItems"
      :loading="loading"
      :bordered="false"
      :single-line="false"
      size="small"
      flex-height
      class="flex-1"
      virtual-scroll
      :row-key="(row: LionConfigItem) => row.key"
    />

    <!-- Diff 弹窗 -->
    <MonacoDiffModal
      v-model:show="diffModal.show"
      :config-key="diffModal.key"
      :test-value="diffModal.testValue"
      :prod-value="diffModal.prodValue"
    />

    <!-- 指定值弹窗 -->
    <n-modal
      v-model:show="specifyModal.show"
      preset="dialog"
      :title="`指定值：${shortKey(specifyModal.key)}`"
      style="width: 480px"
      positive-text="确定"
      negative-text="取消"
      @positive-click="confirmSpecify"
      @negative-click="specifyModal.show = false"
    >
      <div class="pt-3">
        <p class="text-xs text-slate-400 mb-2 font-mono break-all">{{ specifyModal.key }}</p>
        <n-input
          v-model:value="specifyModal.inputVal"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 8 }"
          placeholder="输入指定值…"
          class="font-mono text-xs"
        />
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, h, reactive } from 'vue'
import { Pin } from '@lucide/vue'
import {
  NInput, NButton, NSelect, NDataTable, NModal, NSpin,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { makeFetchItems } from '@/utils/dict'
import { matchQuery } from '@/utils/search'
import { proxyPost } from '@/utils/proxy'
import MonacoDiffModal from '@/components/MonacoDiffModal.vue'

const message = useMessage()

// ─── 类型 ──────────────────────────────────────────────────────────────────────

interface LionRawItem { key: string; name: string; value: string; desc: string; type: string; rank: string }
interface LionConfigItem {
  key: string; name: string; desc: string; type: string
  testValue: string | null; prodValue: string | null
}

// ─── localStorage ──────────────────────────────────────────────────────────────

const LS_APPKEY     = 'lion_appkey'
const lsCacheKey    = (ak: string) => `lion_cache_${ak}`
const lsOverrideKey = (ak: string) => `lion_overrides_${ak}`

function lsGet<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : null } catch { return null }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* 存储空间不足时忽略 */ }
}

// ─── 状态 ──────────────────────────────────────────────────────────────────────

const appkeyInput       = ref<string | null>(null)
const appkeyOptionsFull = ref<{ label: string; value: string }[]>([])
const loading           = ref(false)
const filterLoading     = ref(false)
const allItems          = ref<LionConfigItem[]>([])
const filterRaw         = ref('')
const filterQuery       = ref('')
const filterStatus      = ref<'all' | 'diff' | 'test_only' | 'prod_only'>('all')
const pinnedKeys        = ref(new Set<string>())
const overrides         = ref<Map<string, string>>(new Map())

const specifyModal = reactive<{ show: boolean; key: string; inputVal: string }>({
  show: false, key: '', inputVal: '',
})

const diffModal = reactive<{ show: boolean; key: string; testValue: string | null; prodValue: string | null }>({
  show: false, key: '', testValue: null, prodValue: null,
})

function openDiff(row: LionConfigItem) {
  diffModal.key       = row.key
  diffModal.testValue = row.testValue
  diffModal.prodValue = row.prodValue
  diffModal.show      = true
}

const STATUS_OPTS = [
  { label: '全部',    value: 'all'       },
  { label: '仅差异',  value: 'diff'      },
  { label: '仅 test', value: 'test_only' },
  { label: '仅 prod', value: 'prod_only' },
]

// ─── 防抖过滤 ──────────────────────────────────────────────────────────────────

let debTimer: ReturnType<typeof setTimeout> | null = null
watch(filterRaw, (val) => {
  filterLoading.value = !!val.trim()
  if (debTimer) clearTimeout(debTimer)
  debTimer = setTimeout(() => {
    filterQuery.value   = val
    filterLoading.value = false
  }, 300)
})

// ─── 计算 ──────────────────────────────────────────────────────────────────────

const filteredItems = computed(() => {
  let items = allItems.value
  if (filterStatus.value !== 'all') {
    items = items.filter(item => {
      const isDiff = item.testValue !== null && item.prodValue !== null && item.testValue !== item.prodValue
      if (filterStatus.value === 'diff')      return isDiff
      if (filterStatus.value === 'test_only') return item.testValue !== null && item.prodValue === null
      if (filterStatus.value === 'prod_only') return item.testValue === null && item.prodValue !== null
      return true
    })
  }
  if (filterQuery.value.trim()) {
    // key/name/desc 走 pinyin 全文匹配；值字段用多关键词 includes（避免对大 JSON 做 pinyin 处理）
    const terms = filterQuery.value.toLowerCase().split(/\s+/).filter(Boolean)
    const matchValue = (val: string | null) => {
      if (!val) return false
      const v = val.toLowerCase()
      return terms.every(t => v.includes(t))
    }
    items = items.filter(item =>
      matchQuery(filterQuery.value, item.key, item.name, item.desc) ||
      matchValue(item.testValue) ||
      matchValue(item.prodValue)
    )
  }
  return [...items].sort((a, b) => {
    const ap = pinnedKeys.value.has(a.key) ? 0 : 1
    const bp = pinnedKeys.value.has(b.key) ? 0 : 1
    return ap - bp
  })
})

// ─── 置顶 ──────────────────────────────────────────────────────────────────────

function togglePin(key: string) {
  const s = new Set(pinnedKeys.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  pinnedKeys.value = s
}

// ─── Key 显示（去掉 appkey 前缀） ──────────────────────────────────────────────

function shortKey(key: string): string {
  const prefix = (appkeyInput.value ?? '') + '.'
  return key.startsWith(prefix) ? key.slice(prefix.length) : key
}

// ─── 指定值 ────────────────────────────────────────────────────────────────────

function openSpecify(row: LionConfigItem) {
  specifyModal.key      = row.key
  specifyModal.inputVal = overrides.value.get(row.key) ?? row.testValue ?? row.prodValue ?? ''
  specifyModal.show     = true
}

function confirmSpecify() {
  const val = specifyModal.inputVal.trim()
  const m   = new Map(overrides.value)
  if (val) {
    m.set(specifyModal.key, val)
    message.success('已保存指定值')
  } else {
    m.delete(specifyModal.key)
  }
  overrides.value = m
  if (appkeyInput.value) lsSet(lsOverrideKey(appkeyInput.value), Object.fromEntries(m))
  specifyModal.show = false
}

function cancelOverride(key: string) {
  const m = new Map(overrides.value)
  m.delete(key)
  overrides.value = m
  if (appkeyInput.value) lsSet(lsOverrideKey(appkeyInput.value), Object.fromEntries(m))
  message.success('已取消指定')
}

// ─── Lion API ──────────────────────────────────────────────────────────────────

function lionUrl(env: 'test' | 'prod', appkey: string) {
  return `https://lion.mws${env === 'prod' ? '' : '-test'}.sankuai.com/mwsapi/v1/env/${env}/appKey/${encodeURIComponent(appkey)}/group/default/defaultConfigInstance/type/key/get`
}

function lionBody(pageNum: number, pageSize = 500) {
  return {
    key: '', set: '', swimlane: '', grouptags: '', region: '',
    pageNum, pageSize, orderBy: '-modifyTime', tagIds: [],
    value: '', desc: '', createUser: '', modifyUser: '',
    startCreateTime: '', endCreateTime: '', startModifyTime: '', endModifyTime: '',
    rank: '', usage: null, modifyByVirtualUser: '', bizType: 'normal',
  }
}

async function fetchAllPages(env: 'test' | 'prod', appkey: string): Promise<LionRawItem[]> {
  const PAGE_SIZE = 500
  const url   = lionUrl(env, appkey)
  const extra = { 'x-requested-with': 'XMLHttpRequest' }
  const first = await proxyPost<{ code: number; data: { list: LionRawItem[]; total: number } }>(
    url, lionBody(1, PAGE_SIZE), extra
  )
  if (first?.code !== 0) return []
  const { list, total } = first.data
  if (total <= PAGE_SIZE) return list
  const pages = Math.ceil(total / PAGE_SIZE)
  const rest  = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      proxyPost<{ code: number; data: { list: LionRawItem[] } }>(url, lionBody(i + 2, PAGE_SIZE), extra)
        .then(r => r?.code === 0 ? r.data.list : []).catch(() => [])
    )
  )
  return [...list, ...rest.flat()]
}

function loadOverrides(appkey: string) {
  const saved = lsGet<Record<string, string>>(lsOverrideKey(appkey)) ?? {}
  overrides.value = new Map(Object.entries(saved))
}

async function doSearch() {
  const appkey = appkeyInput.value?.trim() ?? ''
  if (!appkey) return
  loading.value      = true
  allItems.value     = []
  filterRaw.value    = ''
  filterQuery.value  = ''
  filterStatus.value = 'all'
  pinnedKeys.value   = new Set()
  loadOverrides(appkey)
  lsSet(LS_APPKEY, appkey)
  try {
    const [testRaw, prodRaw] = await Promise.all([
      fetchAllPages('test', appkey).catch(() => [] as LionRawItem[]),
      fetchAllPages('prod', appkey).catch(() => [] as LionRawItem[]),
    ])
    const merged = new Map<string, LionConfigItem>()
    for (const item of testRaw)
      merged.set(item.key, { key: item.key, name: item.name, desc: item.desc, type: item.type, testValue: item.value, prodValue: null })
    for (const item of prodRaw) {
      const ex = merged.get(item.key)
      if (ex) ex.prodValue = item.value
      else merged.set(item.key, { key: item.key, name: item.name, desc: item.desc, type: item.type, testValue: null, prodValue: item.value })
    }
    allItems.value = Array.from(merged.values())
    if (!allItems.value.length) {
      message.warning('未找到配置项，请确认 appkey 正确')
    } else {
      lsSet(lsCacheKey(appkey), allItems.value)
    }
  } catch (e) {
    message.error(`查询失败: ${(e as Error).message}`)
  } finally {
    loading.value = false
  }
}

// ─── 表格列 ────────────────────────────────────────────────────────────────────

function valueCell(val: string | null, isDiff: boolean, onClick: () => void) {
  if (val === null) return h('span', { style: 'color:#d1d5db; font-size:12px' }, '—')
  const display = val.length > 80 ? val.slice(0, 80) + '…' : val
  const style = isDiff
    ? 'color:#b45309; background:#fef3c7; padding:1px 4px; border-radius:3px; font-size:11px; font-family:monospace; word-break:break-all; display:block; cursor:pointer'
    : 'font-size:11px; font-family:monospace; color:#374151; word-break:break-all; display:block; cursor:pointer'
  return h('span', { style, title: `${val}\n\n点击查看 Diff`, onClick }, display)
}

const columns: DataTableColumns<LionConfigItem> = [
  {
    title: '', key: 'pin', width: 36,
    render: (row) => {
      const pinned = pinnedKeys.value.has(row.key)
      return h('span', {
        style: `cursor:pointer; display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:4px; color:${pinned ? '#6366f1' : '#d1d5db'}; ${pinned ? 'background:rgba(99,102,241,0.08)' : ''}`,
        title: pinned ? '取消置顶' : '置顶',
        onClick: () => togglePin(row.key),
      }, [h(Pin, { size: 12, fill: pinned ? '#6366f1' : 'none' })])
    },
  },
  {
    title: 'Key', key: 'key', width: 200, ellipsis: true,
    render: (row) => h('span', {
      style: 'font-family:monospace; font-size:12px; color:#5b6af0; cursor:pointer; word-break:break-all',
      title: `${row.key}\n点击复制完整 key`,
      onClick: () => { navigator.clipboard.writeText(row.key); message.success('已复制') },
    }, shortKey(row.key)),
  },
  {
    title: '名称', key: 'name', width: 140,
    render: (row) => h('span', { style: 'font-size:12px; font-weight:500; color:#374151' }, row.name || '—'),
  },
  {
    title: '描述', key: 'desc', width: 180,
    render: (row) => h('span', { style: 'font-size:11px; color:#9ca3af' }, row.desc || '—'),
  },
  {
    title: 'Test', key: 'testValue',
    render: (row) => valueCell(row.testValue, !!(row.testValue !== null && row.prodValue !== null && row.testValue !== row.prodValue), () => openDiff(row)),
  },
  {
    title: 'Prod', key: 'prodValue',
    render: (row) => valueCell(row.prodValue, !!(row.testValue !== null && row.prodValue !== null && row.testValue !== row.prodValue), () => openDiff(row)),
  },
  {
    title: '指定值', key: 'override', width: 150,
    render: (row) => {
      const ov = overrides.value.get(row.key)
      if (ov !== undefined) {
        const display = ov.length > 40 ? ov.slice(0, 40) + '…' : ov
        return h('div', { style: 'display:flex; align-items:flex-start; gap:4px' }, [
          h('span', {
            style: 'font-size:11px; font-family:monospace; color:#059669; background:#d1fae5; padding:1px 4px; border-radius:3px; word-break:break-all; flex:1; cursor:pointer',
            title: `${ov}\n点击修改`,
            onClick: (e: Event) => { e.stopPropagation(); openSpecify(row) },
          }, display),
          h('span', {
            style: 'cursor:pointer; flex-shrink:0; color:#9ca3af; font-size:14px; line-height:1.2; padding:0 2px; border-radius:3px; margin-top:1px',
            title: '取消指定',
            onClick: (e: Event) => { e.stopPropagation(); cancelOverride(row.key) },
          }, '×'),
        ])
      }
      return h('span', {
        style: 'font-size:11px; color:#d1d5db; cursor:pointer; user-select:none; white-space:nowrap',
        title: '指定本地值',
        onClick: (e: Event) => { e.stopPropagation(); openSpecify(row) },
      }, '＋ 指定')
    },
  },
  {
    title: '状态', key: 'status', width: 68,
    render: (row) => {
      const isDiff     = row.testValue !== null && row.prodValue !== null && row.testValue !== row.prodValue
      const isTestOnly = row.testValue !== null && row.prodValue === null
      const isProdOnly = row.testValue === null && row.prodValue !== null
      const [label, bg, color] = isDiff
        ? ['差异',   '#fef3c7', '#d97706']
        : isTestOnly
          ? ['仅test', '#dbeafe', '#2563eb']
          : isProdOnly
            ? ['仅prod', '#f3e8ff', '#9333ea']
            : ['一致',   '#d1fae5', '#059669']
      return h('span', {
        style: `background:${bg}; color:${color}; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; white-space:nowrap`,
      }, label)
    },
  },
]

// ─── 初始化 ────────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    const items = await makeFetchItems('appkey')()
    appkeyOptionsFull.value = items.map(i => ({ label: i.name, value: i.value }))
  } catch { /* 加载失败不影响手动输入 */ }

  // 恢复上一次 appkey 和查询结果
  const lastAppkey = lsGet<string>(LS_APPKEY)
  if (lastAppkey) {
    appkeyInput.value = lastAppkey
    const cached = lsGet<LionConfigItem[]>(lsCacheKey(lastAppkey))
    if (cached?.length) {
      allItems.value = cached
      loadOverrides(lastAppkey)
    }
  }
})
</script>
