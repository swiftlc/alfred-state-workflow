<template>
  <div class="flex flex-col" style="height: calc(100vh - 80px)">
    <div class="flex items-center justify-between mb-5 shrink-0">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">Shepherd 接口</h1>
      <div class="flex items-center gap-2">
        <span v-if="loading" class="flex items-center gap-1.5 text-xs text-slate-400">
          <n-spin size="small" />
          {{ loadingMsg }}
        </span>
        <template v-else>
          <span class="text-xs text-slate-400">共 {{ allItems.length }} 个接口</span>
          <span v-if="savedAt" class="text-xs text-slate-300" :title="new Date(savedAt).toLocaleString('zh-CN')">
            · 更新于 {{ formatTime(savedAt) }}
          </span>
        </template>
        <n-button size="small" :loading="loading" :disabled="loading" @click="refresh">刷新</n-button>
      </div>
    </div>

    <!-- 过滤栏 -->
    <div class="flex items-center gap-2 mb-4 shrink-0">
      <n-input
        v-model:value="filterRaw"
        class="flex-1"
        placeholder="搜索接口名称、路径、分组、描述、后端服务…"
        clearable
        :disabled="loading && !allItems.length"
      />
      <span class="text-xs text-slate-400 whitespace-nowrap">
        {{ filteredItems.length }} / {{ allItems.length }}
      </span>
    </div>

    <!-- 结果表格 -->
    <n-data-table
      :columns="columns"
      :data="filteredItems"
      :loading="loading && !allItems.length"
      :bordered="false"
      :single-line="false"
      size="small"
      flex-height
      class="flex-1"
      :virtual-scroll="filteredItems.length > 60"
      :row-key="(row: ShepherdItem) => row.id"
      :row-props="rowProps"
    />

    <!-- 详情抽屉 -->
    <n-drawer v-model:show="detail.show" :width="540">
      <n-drawer-content :native-scrollbar="false" closable>
        <template #header>
          <div class="flex items-center gap-2">
            <span class="font-semibold text-slate-800 text-sm">{{ detail.item?.name }}</span>
            <n-tag size="small" :bordered="false" type="info">{{ detail.item?.apiGroupName }}</n-tag>
          </div>
        </template>

        <div v-if="detail.loading" class="flex justify-center py-10">
          <n-spin />
        </div>
        <template v-else-if="detail.item">

          <!-- 描述 -->
          <p v-if="detail.item.description" class="text-xs text-slate-500 mb-4 leading-relaxed">
            {{ detail.item.description }}
          </p>

          <!-- 路径卡片 -->
          <div
            class="group flex items-start gap-2 bg-slate-50 hover:bg-indigo-50 rounded-lg px-3 py-2.5 mb-4 cursor-pointer transition-colors"
            title="点击复制路径"
            @click="copy(detail.item!.path, '路径')"
          >
            <span class="font-mono text-xs text-indigo-600 break-all flex-1 leading-relaxed">{{ detail.item.path || '—' }}</span>
            <div class="flex items-center gap-1 flex-shrink-0 mt-0.5">
              <n-tag
                v-for="m in (detail.data?.frontRequestView?.methodTypes ?? '').split(',').filter(Boolean)"
                :key="m"
                size="small" :bordered="false"
                style="font-size:10px; padding:0 5px; height:18px; line-height:18px"
                class="uppercase"
              >{{ m }}</n-tag>
              <span v-if="detail.data?.frontRequestView?.timeout" class="text-[10px] text-slate-400 ml-1">
                {{ detail.data.frontRequestView.timeout }}ms
              </span>
            </div>
          </div>

          <!-- 后端服务 -->
          <template v-if="detail.data?.invokerViews?.length">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">后端服务</p>
            <div
              v-for="(inv, idx) in detail.data.invokerViews"
              :key="idx"
              class="bg-slate-50 rounded-lg p-3 mb-3"
            >
              <!-- Appkey -->
              <div
                v-if="inv.appkey"
                class="flex items-center gap-1.5 mb-2.5 cursor-pointer group/ak"
                @click="copy(inv.appkey!, 'Appkey')"
              >
                <span class="text-[10px] font-medium text-slate-400 uppercase flex-shrink-0">Appkey</span>
                <span class="font-mono text-xs text-slate-600 group-hover/ak:text-indigo-600 truncate transition-colors">{{ inv.appkey }}</span>
              </div>

              <!-- 服务 + 方法 引用块 -->
              <template v-if="inv.serviceName || inv.methodName">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <code v-if="inv.serviceName" class="block text-xs font-mono text-slate-700 break-all leading-relaxed">{{ inv.serviceName }}</code>
                    <code v-if="inv.methodName" class="block text-xs font-mono text-indigo-500 mt-0.5">#{{ inv.methodName }}</code>
                  </div>
                  <n-dropdown
                    trigger="click"
                    :options="invCopyOptions(inv)"
                    @select="(key: string) => copy(invCopyValue(key), invCopyLabel(key, inv))"
                  >
                    <n-button size="tiny" ghost class="flex-shrink-0 mt-0.5">复制 ↓</n-button>
                  </n-dropdown>
                </div>
              </template>

              <!-- HTTP URL -->
              <div v-if="inv.url" class="mt-2 pt-2 border-t border-slate-200">
                <span class="font-mono text-xs text-slate-500 break-all">{{ inv.url }}</span>
              </div>
            </div>
          </template>
          <p v-else-if="detail.data" class="text-xs text-slate-400 mb-4">无后端服务配置</p>

          <!-- 返回模板 -->
          <template v-if="detail.data?.responseView?.response">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">返回模板</p>
            <pre class="text-xs bg-slate-50 p-2.5 rounded-lg overflow-auto max-h-36 font-mono leading-relaxed text-slate-600 whitespace-pre-wrap break-all mb-4">{{ detail.data.responseView.response }}</pre>
          </template>

          <!-- 底部操作 -->
          <div class="flex gap-2 pt-3 border-t border-slate-100">
            <n-button size="small" ghost @click="openShepherdUI">在 Shepherd 打开</n-button>
            <n-button size="small" ghost @click="copy(detail.item!.path, '路径')">复制路径</n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ShepherdView' })

import { ref, computed, watch, onMounted, h, reactive } from 'vue'
import {
  NInput, NDataTable, NDrawer, NDrawerContent, NSpin, NButton, NTag, NDropdown,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { matchQuery, formatTime } from '@/utils/search'
import { proxyGet } from '@/utils/proxy'

const message = useMessage()

// ─── 类型 ──────────────────────────────────────────────────────────────────────

interface ShepherdItem {
  id: number; name: string; path: string; description: string
  apiGroupId: number; apiGroupName: string
}

interface ShepherdGroup {
  id: number
  name: string
  description: string
}

interface InvokerView {
  appkey?: string
  serviceName?: string
  methodName?: string
  type?: string
  timeout?: number
  url?: string
  alias?: string
  loadBalance?: string
  inputs?: Array<{ name: string; source: string; sourceName: string; type: string }>
}

interface ShepherdDetail {
  id?: number
  name?: string
  description?: string
  apiGroupId?: number
  apiGroupName?: string
  frontRequestView?: {
    path?: string
    methodTypes?: string
    timeout?: number
    preParameters?: Array<{ name: string; type: string; required: boolean; desc: string }>
    regexPaths?: string[]
  }
  invokerViews?: InvokerView[]
  responseView?: {
    response?: string
    contentType?: number
    expressType?: number
    transparent?: boolean
    degradation?: string
  }
}

// ─── localStorage 持久化 ────────────────────────────────────────────────────────

const LS_KEY = 'shepherd_apis'

interface LSPayload { items: ShepherdItem[]; savedAt: number }

function lsRead(): LSPayload | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as LSPayload) : null
  } catch { return null }
}

function lsWrite(items: ShepherdItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ items, savedAt: Date.now() }))
  } catch { /* 存储空间不足时忽略 */ }
}

// ─── 状态 ──────────────────────────────────────────────────────────────────────

const loading     = ref(false)
const loadingMsg  = ref('加载中…')
const allItems    = ref<ShepherdItem[]>([])
const savedAt     = ref<number | null>(null)
const filterRaw   = ref('')
const filterQuery = ref('')

const detail = reactive<{
  show: boolean
  loading: boolean
  item: ShepherdItem | null
  data: ShepherdDetail | null
}>({ show: false, loading: false, item: null, data: null })

// ─── 防抖过滤 ──────────────────────────────────────────────────────────────────

let debTimer: ReturnType<typeof setTimeout> | null = null
watch(filterRaw, (val) => {
  if (debTimer) clearTimeout(debTimer)
  debTimer = setTimeout(() => { filterQuery.value = val }, 200)
})

// ─── 过滤 ──────────────────────────────────────────────────────────────────────

const filteredItems = computed(() => {
  if (!filterQuery.value.trim()) return allItems.value
  return allItems.value.filter(item =>
    matchQuery(filterQuery.value, item.name, item.path, item.apiGroupName, item.description ?? '')
  )
})

// ─── 加载全量接口 ──────────────────────────────────────────────────────────────

const HEADERS  = { 'm-appkey': 'fe_mws-shepherd-fe' }
const BASE_URL = 'https://shepherd.mws-test.sankuai.com'
const CONCURRENCY = 6

function parseList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  const d = data as Record<string, unknown>
  for (const key of ['items', 'list', 'apis', 'groups']) {
    if (Array.isArray(d?.[key])) return d[key] as T[]
  }
  return []
}

async function loadAll() {
  loading.value  = true
  loadingMsg.value = '获取分组…'
  allItems.value = []

  try {
    const groupRes = await proxyGet<{ code: number; data: unknown }>(
      `${BASE_URL}/spapi/v1/groups/list`, HEADERS
    )
    if (groupRes?.code !== 0) {
      message.error('获取分组失败')
      return
    }
    const groups = parseList<ShepherdGroup>(groupRes.data)
    if (!groups.length) {
      message.warning('未找到任何分组')
      return
    }

    loadingMsg.value = `共 ${groups.length} 个分组，加载接口…`
    const collected: ShepherdItem[] = []
    let done = 0

    for (let i = 0; i < groups.length; i += CONCURRENCY) {
      const batch = groups.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(async (group) => {
        try {
          const res = await proxyGet<{ code: number; data: unknown }>(
            `${BASE_URL}/spapi/v1/apis/${group.id}`, HEADERS
          )
          if (res?.code === 0) {
            type RawApi = { id: number; name: string; path: string; description: string }
            for (const api of parseList<RawApi>(res.data)) {
              collected.push({
                id: api.id,
                name: api.name,
                path: api.path,
                description: api.description,
                apiGroupId: group.id,
                apiGroupName: group.name,
              })
            }
          }
        } catch { /* 单分组失败不中断 */ }
        done++
      }))
      allItems.value = [...collected]
      loadingMsg.value = `已加载 ${done}/${groups.length} 分组，共 ${collected.length} 个接口…`
    }

    allItems.value = collected
    if (collected.length) {
      lsWrite(collected)
      savedAt.value = Date.now()
    } else {
      message.warning('未找到任何接口')
    }
  } catch (e) {
    message.error(`加载失败: ${(e as Error).message}`)
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await loadAll()
}

// ─── 详情 ──────────────────────────────────────────────────────────────────────

async function openDetail(item: ShepherdItem) {
  detail.show    = true
  detail.loading = true
  detail.item    = item
  detail.data    = null
  try {
    const res = await proxyGet<{ code: number; data: ShepherdDetail }>(
      `${BASE_URL}/spapi/v1/apis/getApi?group=${encodeURIComponent(item.apiGroupName)}&api=${encodeURIComponent(item.name)}`,
      HEADERS
    )
    if (res?.code === 0) {
      detail.data = res.data
      // 若路径/名称从详情里补全
      if (!item.path && detail.data?.frontRequestView?.path) {
        item.path = detail.data.frontRequestView.path
      }
    }
  } catch { /* 详情失败不影响基本展示 */ }
  finally { detail.loading = false }
}

function openShepherdUI() {
  if (!detail.item) return
  const { apiGroupName, apiGroupId, name, id } = detail.item
  const url = `https://shepherd.mws-test.sankuai.com/api-detail?api_group_name=${encodeURIComponent(apiGroupName)}&api_group_id=${apiGroupId}&api_name=${encodeURIComponent(name)}&api_id=${id}&group_tab=api-manage`
  window.open(url, '_blank')
}

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text)
  message.success(`已复制${label}`)
}

// ─── 下拉复制选项 ──────────────────────────────────────────────────────────────

const REF_SUFFIX = '::ref'

function invCopyOptions(inv: InvokerView) {
  const opts: { key: string; label: string }[] = []
  if (inv.serviceName) opts.push({ key: inv.serviceName,  label: '复制服务名' })
  if (inv.methodName)  opts.push({ key: inv.methodName,   label: '复制方法名' })
  if (inv.serviceName && inv.methodName)
    opts.push({ key: `${inv.serviceName}#${inv.methodName}${REF_SUFFIX}`, label: '复制引用' })
  return opts
}

function invCopyLabel(key: string, inv: InvokerView): string {
  if (key.endsWith(REF_SUFFIX)) return '接口引用'
  if (key === inv.serviceName)  return '服务名'
  return '方法名'
}

function invCopyValue(key: string): string {
  return key.endsWith(REF_SUFFIX) ? key.slice(0, -REF_SUFFIX.length) : key
}

// ─── 表格行点击 ────────────────────────────────────────────────────────────────

function rowProps(row: ShepherdItem) {
  return {
    style: 'cursor: pointer',
    onClick: () => openDetail(row),
  }
}

// ─── 表格列 ────────────────────────────────────────────────────────────────────

const columns: DataTableColumns<ShepherdItem> = [
  {
    title: '接口',
    key: 'name',
    width: 200,
    render: (row) => h('div', {}, [
      h('div', { style: 'font-size:12px; font-weight:500; color:#374151; line-height:1.4' }, row.name),
      h('div', { style: 'font-size:11px; color:#9ca3af; margin-top:2px; line-height:1.3' }, row.apiGroupName),
    ]),
  },
  {
    title: '路径',
    key: 'path',
    render: (row) => h('span', {
      style: 'font-family:monospace; font-size:11px; color:#5b6af0; word-break:break-all; display:block',
    }, row.path || '—'),
  },
  {
    title: '描述',
    key: 'description',
    width: 180,
    render: (row) => h('span', { style: 'font-size:11px; color:#9ca3af; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px', title: row.description }, row.description || '—'),
  },
]

// ─── 初始化 ────────────────────────────────────────────────────────────────────

onMounted(() => {
  const cached = lsRead()
  if (cached?.items.length) {
    allItems.value = cached.items
    savedAt.value  = cached.savedAt
  } else {
    loadAll()
  }
})
</script>

<style scoped>
:deep(.n-data-table .n-data-table-tr:hover .n-data-table-td) {
  background: #f5f6ff !important;
}
</style>
