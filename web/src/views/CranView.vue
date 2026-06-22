<template>
  <ContextGroup>
  <div class="flex flex-col overflow-hidden" style="height: 100%">

    <!-- ── 标题行 ── -->
    <div class="shrink-0 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-lg font-semibold text-slate-800 tracking-tight">Crane 定时任务</h1>
        <div class="flex items-center gap-2">
          <span v-if="loading" class="flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full"
                style="background:#f1f5f9;color:#64748b">
            <n-spin :size="11" />
            <span>{{ loadingMsg }}</span>
          </span>
          <template v-else-if="appkeyInput && tasks.length">
            <span v-if="fromCache" class="text-[11px] text-slate-300" title="来自缓存，点刷新重新拉取">缓存</span>
            <span class="text-xs text-slate-400">{{ tasks.length }} 个任务</span>
          </template>
          <n-button size="tiny" :disabled="!appkeyInput || loading" ghost @click="refreshTasks">刷新</n-button>
        </div>
      </div>

      <!-- appKey chip -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <ContextItem
          context-key="appkey"
          :value="appkeyInput ?? ''"
          label="Appkey"
          :fetch-items="fetchAppkeyItems"
          custom-edit
          @edit="onAppkeyEdit"
        >
          <span class="cran-chip" :class="appkeyInput ? 'cran-chip--slate' : 'cran-chip--empty'">
            <span class="font-mono">{{ appkeyInput || 'Appkey…' }}</span>
          </span>
        </ContextItem>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!appkeyInput" class="flex-1 flex flex-col items-center justify-center text-slate-300 select-none">
      <Clock :size="40" class="mb-3 text-slate-200" />
      <div class="text-sm text-slate-400">输入 Appkey 查询定时任务</div>
    </div>

    <!-- 任务列表 -->
    <template v-else>
      <n-input
        v-model:value="searchText"
        placeholder="搜索任务名称 / 描述 / Cron 表达式…"
        clearable
        class="shrink-0 mb-3"
        :disabled="loading"
      />
      <n-data-table
        :columns="columns"
        :data="filteredTasks"
        :loading="loading"
        :bordered="false"
        :single-line="false"
        size="small"
        flex-height
        class="flex-1"
        :row-key="(row: CranTask) => row.taskid"
        :row-props="rowProps"
        :virtual-scroll="filteredTasks.length > 80"
      />
    </template>

    <!-- ── DictPicker：泳道 ── -->
    <DictPicker
      :show="swimlanePickerShow"
      dict-key="swimlane"
      dict-name="泳道"
      :fetch-items="fetchSwimlaneItems"
      allow-input
      placeholder="搜索或输入泳道标识…"
      @update:show="swimlanePickerShow = $event"
      @select="onSwimlaneSelect"
    />

    <!-- ── 任务详情抽屉 ── -->
    <n-drawer v-model:show="drawer.show" :width="620" placement="right">
      <n-drawer-content :native-scrollbar="false" closable class="cran-drawer">
        <template #header>
          <div class="flex items-start gap-3 pr-2 min-w-0">
            <span class="w-2 h-2 rounded-full block mt-1 flex-shrink-0"
                  :class="drawer.task?.status === 2 ? 'bg-emerald-400' : 'bg-slate-300'" />
            <div class="min-w-0">
              <div class="text-sm font-semibold text-slate-800 leading-snug break-all">
                {{ drawer.task?.description || drawer.task?.name?.split('.').pop() || drawer.task?.taskid }}
              </div>
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                <span class="font-mono text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                  {{ drawer.task?.taskid }}
                </span>
                <span class="font-mono text-[11px] text-indigo-500 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                  {{ drawer.task?.crontab }}
                </span>
                <span class="text-[11px] font-medium px-1.5 py-0.5 rounded"
                      :class="drawer.task?.status === 2
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-slate-100 text-slate-400'">
                  {{ drawer.task?.status === 2 ? '已启用' : '已禁用' }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <div v-if="drawer.loading" class="flex flex-col items-center justify-center py-16 gap-3">
          <n-spin :size="24" />
          <div class="text-xs text-slate-400">加载任务详情…</div>
        </div>

        <template v-else-if="drawer.task">
          <n-tabs v-model:value="drawerTab" type="line" size="small" class="cran-tabs">

            <!-- ── 任务信息 ── -->
            <n-tab-pane name="info" tab="任务信息">
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="cran-meta-item">
                  <div class="cran-meta-label">创建人</div>
                  <div class="cran-meta-value">{{ drawer.task.creator || '—' }}</div>
                </div>
                <div class="cran-meta-item">
                  <div class="cran-meta-label">所属 AppKey</div>
                  <div class="cran-meta-value font-mono text-[11px]">{{ drawer.task.appname || '—' }}</div>
                </div>
                <div v-if="drawer.task.executiontimeout" class="cran-meta-item">
                  <div class="cran-meta-label">执行超时</div>
                  <div class="cran-meta-value">{{ drawer.task.executiontimeout }}s</div>
                </div>
                <div v-if="drawer.task.waittimeout" class="cran-meta-item">
                  <div class="cran-meta-label">等待超时</div>
                  <div class="cran-meta-value">{{ drawer.task.waittimeout }}s</div>
                </div>
              </div>

              <!-- 任务类名 -->
              <div class="mb-4">
                <div class="cran-section-title mb-1.5">任务类</div>
                <div class="cran-code-block break-all" @click="copyText(drawer.task.name)" title="点击复制">
                  {{ drawer.task.name }}
                </div>
              </div>

              <!-- taskItem 只读 -->
              <div v-if="drawer.task.taskitem" class="mb-4">
                <div class="cran-section-title mb-1.5">任务参数（taskItem）</div>
                <div class="border border-slate-100 rounded-lg overflow-hidden">
                  <MonacoPreview :content="formatJson(drawer.task.taskitem)" height="200px" />
                </div>
              </div>

              <!-- 路由规则只读 -->
              <div v-if="parsedRouteRules.length">
                <div class="cran-section-title mb-2">路由规则</div>
                <!-- 单条 → 表单展示 -->
                <div v-if="parsedRouteRules.length === 1" class="cran-route-form cran-route-form--readonly">
                  <div class="cran-route-row">
                    <span class="cran-route-label">泳道</span>
                    <span class="cran-route-value cran-swimlane-tag">
                      {{ parsedRouteRules[0].swimlane || '（主干）' }}
                    </span>
                  </div>
                  <div class="cran-route-row">
                    <span class="cran-route-label">cell</span>
                    <span class="cran-route-value font-mono text-slate-600">{{ parsedRouteRules[0].cell }}</span>
                  </div>
                  <div class="cran-route-row">
                    <span class="cran-route-label">grouptags</span>
                    <span class="cran-route-value font-mono text-slate-600">{{ parsedRouteRules[0].grouptags }}</span>
                  </div>
                </div>
                <!-- 多条 → JSON -->
                <div v-else class="border border-slate-100 rounded-lg overflow-hidden">
                  <MonacoPreview :content="formatJson(drawer.task.routeRules!)" height="120px" />
                </div>
              </div>
            </n-tab-pane>

            <!-- ── 手动触发 ── -->
            <n-tab-pane name="trigger" tab="手动触发">
              <div class="space-y-4">

                <!-- 触发结果 banner -->
                <div v-if="execResult" class="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
                     :class="execResult.ok
                       ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                       : 'bg-red-50 border border-red-100 text-red-600'">
                  <span class="flex-shrink-0 mt-0.5 font-bold">{{ execResult.ok ? '✓' : '✗' }}</span>
                  <div>
                    <div class="font-medium">{{ execResult.ok ? '触发成功' : '触发失败' }}</div>
                    <div class="font-mono text-[11px] mt-0.5 opacity-80">
                      {{ execResult.ok ? execResult.attemptId : execResult.msg }}
                    </div>
                  </div>
                </div>

                <!-- taskItem 编辑 -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <div class="cran-section-title">任务参数（taskItem）</div>
                    <button class="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                            @click="resetTaskItem">重置</button>
                  </div>
                  <div class="border border-slate-200 rounded-lg overflow-hidden">
                    <LcMonacoEditor v-model="execTaskItem" language="json" height="180px" />
                  </div>
                </div>

                <!-- 路由规则 - 表单 -->
                <div>
                  <div class="cran-section-title mb-2">路由规则（执行泳道）</div>
                  <div class="cran-route-form">
                    <!-- 泳道 - DictPicker -->
                    <div class="cran-route-row">
                      <span class="cran-route-label">泳道</span>
                      <div class="flex items-center gap-2 flex-1">
                        <button
                          class="flex items-center gap-1.5 text-xs border border-slate-200 rounded-md px-2.5 py-1
                                 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors text-slate-700 cursor-pointer"
                          @click="openSwimlanePicker"
                        >
                          <span class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                :class="execRule.swimlane ? 'bg-indigo-400' : 'bg-slate-300'" />
                          <span :class="execRule.swimlane ? '' : 'text-slate-400'">
                            {{ execRule.swimlane || '主干（不指定泳道）' }}
                          </span>
                        </button>
                        <button v-if="execRule.swimlane"
                                class="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                                @click="execRule.swimlane = ''">清空</button>
                      </div>
                    </div>
                    <!-- cell -->
                    <div class="cran-route-row">
                      <span class="cran-route-label">cell</span>
                      <n-input v-model:value="execRule.cell" size="tiny" class="flex-1 max-w-40" />
                    </div>
                    <!-- grouptags -->
                    <div class="cran-route-row">
                      <span class="cran-route-label">grouptags</span>
                      <n-input v-model:value="execRule.grouptags" size="tiny" class="flex-1 max-w-48" />
                    </div>
                  </div>
                </div>

                <!-- 触发按钮 -->
                <div class="flex items-center gap-3 pt-1">
                  <n-button :loading="executing" :disabled="executing" size="small" @click="doExecute">
                    触发执行
                  </n-button>
                  <span class="text-[11px] text-slate-400">触发后约 1s 自动跳到历史记录</span>
                </div>
              </div>
            </n-tab-pane>

            <!-- ── 执行历史 ── -->
            <n-tab-pane name="history" tab="执行历史">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs text-slate-400">最近 {{ historyList.length }} 条</span>
                <n-button size="tiny" ghost :loading="historyLoading" @click="fetchHistory(1)">刷新</n-button>
              </div>

              <div v-if="historyLoading && !historyList.length" class="flex justify-center py-10">
                <n-spin :size="18" />
              </div>
              <div v-else-if="!historyList.length" class="flex flex-col items-center py-12 text-slate-300 select-none">
                <Clock :size="28" class="mb-2" />
                <div class="text-xs text-slate-400">暂无执行记录</div>
              </div>

              <div v-else class="space-y-2">
                <div
                  v-for="item in historyList"
                  :key="item.id"
                  class="cran-attempt"
                  :class="{ 'cran-attempt--open': expandedAttempts.has(item.id) }"
                >
                  <!-- 色条 -->
                  <div class="cran-attempt__bar"
                       :class="item.status === 7 ? 'bg-emerald-400' : item.status === 6 ? 'bg-red-400' : 'bg-amber-400'" />

                  <div class="flex-1 min-w-0">
                    <!-- 头部行 -->
                    <div class="flex items-center justify-between">
                      <button class="flex items-center gap-1.5 min-w-0 text-left hover:opacity-70 transition-opacity"
                              @click="toggleAttempt(item.id)">
                        <span class="font-mono text-[11px] text-slate-500 truncate">{{ item.attemptid }}</span>
                        <span class="text-[10px] text-slate-300 flex-shrink-0">
                          {{ expandedAttempts.has(item.id) ? '▾' : '▸' }}
                        </span>
                      </button>
                      <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span class="text-[11px] font-semibold"
                              :class="item.status === 7 ? 'text-emerald-600' : item.status === 6 ? 'text-red-500' : 'text-amber-500'">
                          {{ STATUS_MAP[item.status] ?? `状态${item.status}` }}
                        </span>
                        <!-- 重复执行 -->
                        <button class="text-[10px] text-slate-400 hover:text-indigo-500 transition-colors border border-slate-200 hover:border-indigo-200 rounded px-1.5 py-0.5"
                                title="使用此次参数重新执行"
                                @click.stop="rerunAttempt(item)">
                          重执行
                        </button>
                      </div>
                    </div>

                    <!-- 元信息 -->
                    <div class="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
                      <span>{{ formatTs(item.starttime) }}</span>
                      <template v-if="item.endtime && item.starttime">
                        <span class="text-slate-200">·</span>
                        <span>{{ ((item.endtime - item.starttime) / 1000).toFixed(1) }}s</span>
                      </template>
                      <span class="text-slate-200">·</span>
                      <!-- exechost - 可交互 -->
                      <button class="font-mono hover:text-slate-600 transition-colors"
                              title="点击查看机器操作"
                              @click.stop="onExecHost(item.exechost)">
                        {{ item.exechost }}
                      </button>
                    </div>

                    <!-- 展开详情 -->
                    <template v-if="expandedAttempts.has(item.id)">
                      <!-- 执行路由规则 -->
                      <div v-if="parseRouteRules(item.routeRuleOrList)" class="mt-3">
                        <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">执行路由规则</div>
                        <div v-if="parseRouteRules(item.routeRuleOrList)!.length === 1" class="cran-route-form cran-route-form--compact cran-route-form--readonly">
                          <div class="cran-route-row">
                            <span class="cran-route-label">泳道</span>
                            <span class="cran-route-value cran-swimlane-tag">
                              {{ parseRouteRules(item.routeRuleOrList)![0].swimlane || '（主干）' }}
                            </span>
                          </div>
                          <div class="cran-route-row">
                            <span class="cran-route-label">cell</span>
                            <span class="cran-route-value font-mono">{{ parseRouteRules(item.routeRuleOrList)![0].cell }}</span>
                          </div>
                        </div>
                        <pre v-else class="cran-code-block text-[10px]">{{ formatJson(JSON.stringify(parseRouteRules(item.routeRuleOrList))) }}</pre>
                      </div>

                      <!-- 执行参数 -->
                      <div v-if="item.taskItem" class="mt-3">
                        <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">执行参数（taskItem）</div>
                        <pre class="cran-code-block text-[10px] max-h-32 overflow-y-auto">{{ formatJson(item.taskItem) }}</pre>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- 历史分页 -->
                <div v-if="historyTotal > 10" class="flex justify-end pt-2">
                  <n-pagination
                    v-model:page="historyPage"
                    :page-count="Math.ceil(historyTotal / 10)"
                    size="small"
                    @update:page="fetchHistory"
                  />
                </div>
              </div>
            </n-tab-pane>

          </n-tabs>
        </template>
      </n-drawer-content>
    </n-drawer>

  </div>
  </ContextGroup>
</template>

<script setup lang="ts">
import { ref, computed, h, watch, reactive } from 'vue'
import { Clock } from '@lucide/vue'
import {
  NDataTable, NInput, NPagination, NButton, NSpin,
  NDrawer, NDrawerContent, NTabs, NTabPane, useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import ContextItem from '@/components/ContextItem.vue'
import ContextGroup from '@/components/ContextGroup.vue'
import DictPicker from '@/components/DictPicker.vue'
import LcMonacoEditor from '@/components/lowcode/LcMonacoEditor.vue'
import MonacoPreview from '@/components/MonacoPreview.vue'
import { matchQuery } from '@/utils/search'
import { makeFetchItems } from '@/utils/dict'
import { proxyGet, proxyPost } from '@/utils/proxy'
import type { ContextDataItem } from '@/types'

const message = useMessage()

// ─── 执行状态映射 ────────────────────────────────────────────────────────────
const STATUS_MAP: Record<number, string> = {
  1: '等待中', 2: '运行中', 3: '取消中', 4: '已取消',
  5: '失败',   6: '执行失败', 7: '成功',  8: '超时', 9: '系统失败',
}

// ─── 类型 ─────────────────────────────────────────────────────────────────────
interface RouteRule { swimlane: string; cell: string; grouptags: string }
interface CranTask {
  taskid:    string; name: string; description: string
  crontab:   string; status: number; appname: string
  creator:   string; taskitem: string; routeRules?: string
  executiontimeout?: number; waittimeout?: number
}
interface CranAttempt {
  id:        number; attemptid: string; taskid: string
  starttime: number; endtime: number; status: number
  exechost:  string; taskItem: string
  routeRuleOrList?: string   // 执行时的路由规则，字段名按实际 API 返回
}

// ─── 状态 ─────────────────────────────────────────────────────────────────────
const appkeyInput = ref<string | null>(null)
const tasks       = ref<CranTask[]>([])
const loading     = ref(false)
const loadingMsg  = ref('加载任务…')
const fromCache   = ref(false)
const searchText  = ref('')

// ✦ 任务缓存：appKey → CranTask[]（无限期，手动刷新清除）
const taskCache = ref(new Map<string, CranTask[]>())

// ─── 抽屉 ─────────────────────────────────────────────────────────────────────
const drawer    = ref<{ show: boolean; task: CranTask | null; loading: boolean }>({
  show: false, task: null, loading: false,
})
const drawerTab = ref<'info' | 'trigger' | 'history'>('info')

// ─── 执行历史 ─────────────────────────────────────────────────────────────────
const historyList      = ref<CranAttempt[]>([])
const historyTotal     = ref(0)
const historyPage      = ref(1)
const historyLoading   = ref(false)
const expandedAttempts = ref(new Set<number>())

// ─── 手动触发 ─────────────────────────────────────────────────────────────────
const execTaskItem = ref('')
const execRule     = reactive<RouteRule>({ swimlane: '', cell: 'default', grouptags: 'La:default' })
const executing    = ref(false)
const execResult   = ref<{ ok: boolean; attemptId?: string; msg?: string } | null>(null)

// ─── 泳道 DictPicker ──────────────────────────────────────────────────────────
const swimlanePickerShow = ref(false)
const fetchSwimlaneItems = makeFetchItems('swimlane')

function openSwimlanePicker() { swimlanePickerShow.value = true }
function onSwimlaneSelect(item: ContextDataItem) {
  execRule.swimlane = item.value ?? ''
}

// ─── localStorage 持久化 ──────────────────────────────────────────────────────
const LS_KEY = 'cran_appkey'
const _saved = localStorage.getItem(LS_KEY)
if (_saved) appkeyInput.value = _saved

watch(appkeyInput, v => {
  if (v) localStorage.setItem(LS_KEY, v)
  else   localStorage.removeItem(LS_KEY)
})

// ─── 工具 ─────────────────────────────────────────────────────────────────────
function formatTs(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function formatJson(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2) }
  catch { return raw }
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => message.success('已复制'))
}

function parseRouteRules(raw: string | undefined): RouteRule[] | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (Array.isArray(p)) return p as RouteRule[]
    if (typeof p === 'object') return [p as RouteRule]
    return null
  } catch { return null }
}

// ─── 解析当前任务路由规则（只读展示） ────────────────────────────────────────
const parsedRouteRules = computed<RouteRule[]>(() => {
  return parseRouteRules(drawer.value.task?.routeRules) ?? []
})

// ─── 过滤 ─────────────────────────────────────────────────────────────────────
const filteredTasks = computed(() => {
  const q = searchText.value.trim()
  if (!q) return tasks.value
  return tasks.value.filter(t => matchQuery(q, t.taskid, t.name, t.description, t.crontab))
})

// ─── 表格列 ──────────────────────────────────────────────────────────────────
const columns: DataTableColumns<CranTask> = [
  {
    title: '任务', key: 'name',
    render: row => h('div', { class: 'py-0.5' }, [
      h('div', { class: 'text-xs font-medium text-slate-700 truncate max-w-xs', title: row.description || row.name },
        row.description || row.name.split('.').pop() || row.name),
      h('div', { class: 'text-[10px] text-slate-400 font-mono mt-0.5 truncate', title: row.name }, row.name),
    ]),
  },
  {
    title: 'Cron', key: 'crontab', width: 148,
    render: row => h('span', { class: 'text-[11px] font-mono text-indigo-600' }, row.crontab),
  },
  {
    title: '状态', key: 'status', width: 68,
    render: row => h('span', {
      class: `inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${
        row.status === 2 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
      }`,
    }, [
      h('span', { class: `w-1.5 h-1.5 rounded-full ${row.status === 2 ? 'bg-emerald-400' : 'bg-slate-300'}` }),
      row.status === 2 ? '启用' : '禁用',
    ]),
  },
  {
    title: '创建人', key: 'creator', width: 80,
    render: row => h('span', { class: 'text-xs text-slate-500' }, row.creator || '—'),
  },
]

function rowProps(row: CranTask) {
  return { style: 'cursor:pointer', onClick: () => openDrawer(row) }
}

// ─── Crane 请求 ───────────────────────────────────────────────────────────────
const CRANE_BASE    = 'https://crane.mws-test.sankuai.com'
const CRANE_HEADERS = { 'x-requested-with': 'XMLHttpRequest' }

// ─── 全量拉取（自动翻页，带缓存） ─────────────────────────────────────────────
async function fetchAllTasks(forceRefresh = false) {
  if (!appkeyInput.value) return
  const appkey = appkeyInput.value

  // 命中缓存
  if (!forceRefresh && taskCache.value.has(appkey)) {
    tasks.value = taskCache.value.get(appkey)!
    fromCache.value = true
    return
  }

  loading.value   = true
  fromCache.value = false
  tasks.value     = []
  const PAGE_SIZE = 50
  let page = 1

  try {
    while (true) {
      loadingMsg.value = `加载第 ${page} 页…`
      const url  = `${CRANE_BASE}/task/getTaskSlice?appKey=${encodeURIComponent(appkey)}&pageNum=${page}&pageSize=${PAGE_SIZE}`
      const json = await proxyGet<{
        status: string
        result?: { items: CranTask[]; total: number; pages: number }
      }>(url, CRANE_HEADERS)

      if (json.status !== 'success' || !json.result) break

      const items = json.result.items ?? []
      tasks.value = [...tasks.value, ...items]

      if (page >= json.result.pages || items.length < PAGE_SIZE) break
      page++
    }
    // 写入缓存
    taskCache.value.set(appkey, [...tasks.value])
  } catch (e: any) {
    message.error(`加载任务失败：${e.message}`)
  } finally {
    loadingMsg.value = '加载任务…'
    loading.value = false
  }
}

// 手动刷新：清除当前 appKey 缓存
function refreshTasks() {
  if (appkeyInput.value) {
    taskCache.value.delete(appkeyInput.value)
    fetchAllTasks(true)
  }
}

// ─── Appkey 回调 ──────────────────────────────────────────────────────────────
const fetchAppkeyItems = makeFetchItems('appkey')

function onAppkeyEdit(item: ContextDataItem) {
  appkeyInput.value = item.value ?? null
  tasks.value = []
  if (appkeyInput.value) fetchAllTasks()
}

// ─── 打开详情抽屉 ──────────────────────────────────────────────────────────────
async function openDrawer(task: CranTask) {
  execResult.value        = null
  historyList.value       = []
  historyTotal.value      = 0
  historyPage.value       = 1
  drawerTab.value         = 'info'
  expandedAttempts.value  = new Set()

  drawer.value = { show: true, task, loading: true }

  // 初始化编辑区
  execTaskItem.value = formatJson(task.taskitem || '{}')

  // 拉取详情（含 routeRules）
  try {
    const url  = `${CRANE_BASE}/task/detail?taskid=${encodeURIComponent(task.taskid)}`
    const json = await proxyGet<{ status: string; result?: CranTask }>(url, CRANE_HEADERS)
    if (json.status === 'success' && json.result) {
      drawer.value.task = { ...task, ...json.result }
      // 初始化执行路由规则
      const rules = parseRouteRules(json.result.routeRules)
      if (rules?.length) {
        execRule.swimlane  = rules[0].swimlane  ?? ''
        execRule.cell      = rules[0].cell      ?? 'default'
        execRule.grouptags = rules[0].grouptags ?? 'La:default'
      }
    }
  } catch {}
  drawer.value.loading = false
  fetchHistory(1)
}

function resetTaskItem() {
  if (drawer.value.task) execTaskItem.value = formatJson(drawer.value.task.taskitem || '{}')
}

// ─── 展开/折叠历史 ────────────────────────────────────────────────────────────
function toggleAttempt(id: number) {
  if (expandedAttempts.value.has(id)) expandedAttempts.value.delete(id)
  else expandedAttempts.value.add(id)
  expandedAttempts.value = new Set(expandedAttempts.value) // 触发响应
}

// ─── 基于历史重复执行 ─────────────────────────────────────────────────────────
function rerunAttempt(item: CranAttempt) {
  // 填入历史参数
  execTaskItem.value = formatJson(item.taskItem || '{}')

  const rules = parseRouteRules(item.routeRuleOrList)
  if (rules?.length) {
    execRule.swimlane  = rules[0].swimlane  ?? ''
    execRule.cell      = rules[0].cell      ?? 'default'
    execRule.grouptags = rules[0].grouptags ?? 'La:default'
  }

  execResult.value = null
  drawerTab.value  = 'trigger'
  message.info('已填入历史参数，确认后点击触发执行')
}

// ─── 执行历史 ─────────────────────────────────────────────────────────────────
async function fetchHistory(page = historyPage.value) {
  if (!drawer.value.task) return
  historyLoading.value = true
  historyPage.value    = page
  try {
    const url  = `${CRANE_BASE}/attempt/page/history?taskId=${encodeURIComponent(drawer.value.task.taskid)}&pageNum=${page}&pageSize=10`
    const json = await proxyGet<{
      status: string
      result?: { list: CranAttempt[]; total: number }
    }>(url, CRANE_HEADERS)
    if (json.status === 'success') {
      historyList.value  = json.result?.list ?? []
      historyTotal.value = json.result?.total ?? 0
    }
  } catch {}
  historyLoading.value = false
}

// ─── 机器交互（待实现） ────────────────────────────────────────────────────────
function onExecHost(host: string) {
  message.info(`机器登录功能待实现：${host}`)
}

// ─── 手动触发 ─────────────────────────────────────────────────────────────────
async function doExecute() {
  if (!drawer.value.task) return
  const task = drawer.value.task
  executing.value  = true
  execResult.value = null

  // 构造路由规则
  const routeRuleList = [{ ...execRule }]

  // 压缩 taskItem
  let taskItemStr = execTaskItem.value.trim()
  try { taskItemStr = JSON.stringify(JSON.parse(taskItemStr)) } catch {}

  try {
    const url  = `${CRANE_BASE}/attempt/executeJob/${encodeURIComponent(task.taskid)}`
    const json = await proxyPost<{ status: string; result?: string; message?: string }>(
      url,
      { taskId: task.taskid, taskItem: taskItemStr, routeRuleList, hostName: '' },
      CRANE_HEADERS,
    )
    if (json.status === 'success') {
      execResult.value = { ok: true, attemptId: json.result }
      setTimeout(() => {
        drawerTab.value = 'history'
        fetchHistory(1)
      }, 1200)
    } else {
      execResult.value = { ok: false, msg: json.message || '触发失败' }
    }
  } catch (e: any) {
    execResult.value = { ok: false, msg: e.message }
  }
  executing.value = false
}

// ─── 初始加载 ─────────────────────────────────────────────────────────────────
watch(appkeyInput, v => { if (v) fetchAllTasks() }, { immediate: true })
</script>

<style scoped>
/* ── chip ──────────────────────────────────────────────────────────────────── */
.cran-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 6px; font-size: 12px; line-height: 1.6;
  border: 1px solid; transition: background 0.12s, border-color 0.12s, color 0.12s;
  user-select: none; cursor: pointer; white-space: nowrap;
}
.cran-chip--slate  { background: #f1f5f9; border-color: #e2e8f0; color: #475569; }
.cran-chip--slate:hover { background: #e8ecf2; border-color: #c8d0db; }
.cran-chip--empty  { background: transparent; border-style: dashed; border-color: #cbd5e1; color: #94a3b8; cursor: default; }

/* ── 抽屉 tab ──────────────────────────────────────────────────────────────── */
.cran-tabs :deep(.n-tabs-nav) { margin-bottom: 16px; }

/* ── 元信息卡片 ─────────────────────────────────────────────────────────────── */
.cran-meta-item { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px; padding: 8px 12px; }
.cran-meta-label { font-size: 10px; color: #94a3b8; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
.cran-meta-value  { font-size: 12px; color: #374151; font-weight: 500; }

/* ── section title ─────────────────────────────────────────────────────────── */
.cran-section-title { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; }

/* ── 只读代码块 ─────────────────────────────────────────────────────────────── */
.cran-code-block {
  background: #f8fafc; border: 1px solid #e8ecf4; border-radius: 8px;
  padding: 8px 12px; font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px; color: #475569; cursor: pointer; transition: background 0.12s;
}
.cran-code-block:hover { background: #f1f5f9; }

/* ── 路由规则表单 ────────────────────────────────────────────────────────────── */
.cran-route-form {
  background: #f8fafc; border: 1px solid #e8ecf4; border-radius: 8px;
  overflow: hidden;
}
.cran-route-form--compact { background: transparent; border: 1px solid #f1f5f9; }
.cran-route-row {
  display: flex; align-items: center; gap: 12px;
  padding: 7px 12px; border-bottom: 1px solid #f1f5f9;
}
.cran-route-row:last-child { border-bottom: none; }
.cran-route-label {
  width: 64px; flex-shrink: 0; font-size: 11px; color: #94a3b8;
  font-weight: 500; font-family: monospace;
}
.cran-route-value  { font-size: 12px; color: #374151; flex: 1; }
.cran-route-form--readonly .cran-route-row { padding: 6px 12px; }

/* ── 泳道标签 ────────────────────────────────────────────────────────────────── */
.cran-swimlane-tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-family: monospace;
  color: #4f46e5; background: #eef2ff; border: 1px solid #c7d2fe;
  padding: 1px 8px; border-radius: 6px;
}

/* ── 执行历史条目 ────────────────────────────────────────────────────────────── */
.cran-attempt {
  display: flex; align-items: flex-start; gap: 10px;
  background: #f8fafc; border: 1px solid #f1f5f9;
  border-radius: 8px; padding: 9px 12px;
  transition: border-color 0.12s, background 0.12s;
}
.cran-attempt:hover { background: #f1f5f9; border-color: #e2e8f0; }
.cran-attempt--open { background: #fff; border-color: #e2e8f0; }
.cran-attempt__bar  { width: 3px; border-radius: 2px; flex-shrink: 0; align-self: stretch; min-height: 24px; }
</style>
