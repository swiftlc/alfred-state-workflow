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
    <ContextGroup>
    <n-drawer v-model:show="detail.show" :width="580">
      <n-drawer-content :native-scrollbar="false" closable>
        <template #header>
          <div class="flex items-center gap-2 min-w-0">
            <ContextItem context-key="api_name" :value="detail.item?.name ?? ''" label="接口名">
              <span class="font-mono font-semibold text-slate-800">{{ detail.item?.name }}</span>
            </ContextItem>
            <ContextItem context-key="api_group" :value="detail.item?.apiGroupName ?? ''" label="分组">
              <span class="text-[11px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-medium flex-shrink-0 cursor-pointer hover:bg-indigo-100 transition-colors">
                {{ detail.item?.apiGroupName }}
              </span>
            </ContextItem>
          </div>
        </template>

        <div v-if="detail.loading" class="flex justify-center py-10">
          <n-spin />
        </div>
        <template v-else-if="detail.item">

          <!-- 描述 -->
          <p v-if="detail.item.description" class="text-sm text-slate-500 mb-5 leading-relaxed">
            {{ detail.item.description }}
          </p>

          <!-- 路径区块 -->
          <div class="mb-5">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">路径</span>
              <div class="flex items-center gap-1">
                <ContextItem
                  v-for="m in (detail.data?.frontRequestView?.methodTypes ?? '').split(',').filter(Boolean)"
                  :key="m"
                  context-key="http_method"
                  :value="m"
                  :label="m"
                >
                  <span
                    class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded cursor-pointer"
                    :class="m.toLowerCase()==='get'    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            m.toLowerCase()==='post'   ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                            m.toLowerCase()==='put'    ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                            m.toLowerCase()==='delete' ? 'bg-red-50 text-red-600 border border-red-100' :
                                                         'bg-slate-100 text-slate-600 border border-slate-200'"
                  >{{ m }}</span>
                </ContextItem>
              </div>
              <span v-if="detail.data?.frontRequestView?.timeout" class="text-[10px] text-slate-300 ml-auto">
                {{ detail.data.frontRequestView.timeout }}ms
              </span>
            </div>
            <ContextItem
              context-key="route"
              :value="detail.item.path"
              label="路径"
              :extra-actions="[{ key: 'open_shepherd', label: '在 Shepherd 查看' }]"
              bare
              class="block"
              @action="handleRouteAction"
            >
              <div class="font-mono text-xs text-indigo-600 bg-indigo-50/60 border border-transparent rounded-lg px-3 py-2.5 break-all leading-relaxed cursor-pointer hover:border-indigo-100 hover:bg-indigo-50 transition-colors">
                {{ detail.item.path || '—' }}
              </div>
            </ContextItem>
          </div>

          <!-- 后端服务 -->
          <template v-if="detail.data?.invokerViews?.length">
            <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">后端服务</div>
            <div
              v-for="(inv, idx) in detail.data.invokerViews"
              :key="idx"
              class="border border-slate-100 rounded-xl p-4 mb-3 bg-white"
            >
              <!-- 类型 badge + appkey -->
              <div class="flex items-center gap-2 mb-3">
                <span
                  class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                  :class="inv.type === 'http'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    : 'bg-violet-50 text-violet-700 border border-violet-100'"
                >{{ inv.type ?? 'rpc' }}</span>
                <ContextItem
                  v-if="inv.appkey"
                  context-key="appkey"
                  :value="inv.appkey"
                  label="Appkey"
                  :fetch-items="fetchAppkeyItems"
                  bare
                  class="flex-1 min-w-0"
                >
                  <span class="font-mono text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 truncate max-w-full cursor-pointer hover:bg-slate-100 transition-colors block">
                    {{ inv.appkey }}
                  </span>
                </ContextItem>
              </div>

              <!-- 服务 + 方法 -->
              <ContextItem
                v-if="inv.serviceName"
                context-key="reference"
                :value="inv.methodName ? `${inv.serviceName}#${inv.methodName}` : inv.serviceName"
                label="接口引用"
                :meta="{ serviceName: inv.serviceName, methodName: inv.methodName }"
                bare
                class="block w-full"
              >
                <div class="bg-slate-50 rounded-lg px-3 py-2.5 font-mono cursor-pointer hover:bg-indigo-50/40 transition-colors">
                  <div class="text-[11px] text-slate-500 break-all leading-relaxed">{{ inv.serviceName }}</div>
                  <div v-if="inv.methodName" class="text-xs text-indigo-600 font-semibold mt-1.5">
                    <span class="text-slate-300 mr-0.5">#</span>{{ inv.methodName }}
                  </div>
                </div>
              </ContextItem>

              <!-- HTTP URL -->
              <div v-if="inv.url" class="mt-2.5 font-mono text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 break-all">
                {{ inv.url }}
              </div>
            </div>
          </template>
          <p v-else-if="detail.data" class="text-xs text-slate-400 mb-4">无后端服务配置</p>

          <!-- 返回模板 -->
          <template v-if="detail.data?.responseView?.response">
            <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">返回模板</div>
            <pre class="text-xs bg-slate-50 border border-slate-100 px-3 py-2.5 rounded-xl overflow-auto max-h-40 font-mono leading-relaxed text-slate-600 whitespace-pre-wrap break-all mb-4">{{ detail.data.responseView.response }}</pre>
          </template>

        </template>
      </n-drawer-content>
    </n-drawer>
    </ContextGroup>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ShepherdView' })

import { ref, computed, watch, onMounted, h, reactive } from 'vue'
import {
  NInput, NDataTable, NDrawer, NDrawerContent, NSpin, NButton,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { matchQuery, formatTime } from '@/utils/search'
import { proxyGet } from '@/utils/proxy'
import { makeFetchItems } from '@/utils/dict'
import ContextItem from '@/components/ContextItem.vue'
import ContextGroup from '@/components/ContextGroup.vue'

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

const fetchAppkeyItems = makeFetchItems('appkey')

function handleRouteAction(key: string) {
  if (key === 'open_shepherd') openShepherdUI()
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
