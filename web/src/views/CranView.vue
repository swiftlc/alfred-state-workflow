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
    <div v-if="!appkeyInput" class="flex-1 flex flex-col items-center justify-center select-none">
      <Clock :size="36" class="mb-3 text-slate-200" />
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

    <!-- ── 任务详情抽屉 ── -->
    <n-drawer v-model:show="drawer.show" :width="600" placement="right">
      <n-drawer-content :native-scrollbar="false" closable>
        <template #header>
          <div class="flex items-start gap-3 pr-2 min-w-0">
            <span class="w-2 h-2 rounded-full block mt-[5px] flex-shrink-0"
                  :class="drawer.task?.status === 2 ? 'bg-emerald-400' : 'bg-slate-300'" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-slate-800 leading-snug break-all">
                {{ drawer.task?.description || drawer.task?.name?.split('.').pop() || drawer.task?.taskid }}
              </div>
              <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                <span class="font-mono text-[11px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                  {{ drawer.task?.taskid }}
                </span>
                <span class="font-mono text-[11px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                  {{ drawer.task?.crontab }}
                </span>
                <span class="text-[11px] font-medium px-1.5 py-0.5 rounded"
                      :class="drawer.task?.status === 2
                        ? 'text-emerald-600 bg-emerald-50'
                        : 'text-slate-400 bg-slate-100'">
                  {{ drawer.task?.status === 2 ? '已启用' : '已禁用' }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <div v-if="drawer.loading" class="flex flex-col items-center justify-center py-16 gap-3">
          <n-spin :size="20" />
          <div class="text-xs text-slate-400">加载任务详情…</div>
        </div>

        <template v-else-if="drawer.task">
          <n-tabs v-model:value="drawerTab" type="line" size="small" animated
                  pane-style="padding-top:0">

            <!-- ────── 任务信息 ────── -->
            <n-tab-pane name="info" tab="任务信息" class="space-y-4 pt-4">

              <!-- 元信息 -->
              <div class="grid grid-cols-2 gap-2">
                <div class="cran-kv">
                  <div class="cran-kv__label">创建人</div>
                  <div class="cran-kv__value">{{ drawer.task.creator || '—' }}</div>
                </div>
                <div class="cran-kv">
                  <div class="cran-kv__label">执行超时</div>
                  <div class="cran-kv__value">{{ drawer.task.executiontimeout ? `${drawer.task.executiontimeout}s` : '—' }}</div>
                </div>
                <div class="cran-kv col-span-2">
                  <div class="cran-kv__label">任务类</div>
                  <div class="cran-kv__value font-mono text-[11px] break-all cursor-pointer hover:text-indigo-600 transition-colors"
                       title="点击复制"
                       @click="copyText(drawer.task.name)">
                    {{ drawer.task.name }}
                  </div>
                </div>
              </div>

              <!-- taskItem 只读 -->
              <div v-if="drawer.task.taskitem">
                <div class="cran-label mb-1.5">任务参数（taskItem）</div>
                <div class="rounded-lg overflow-hidden border border-slate-100">
                  <MonacoPreview :content="formatJson(drawer.task.taskitem)" height="180px" />
                </div>
              </div>

              <!-- 路由规则 只读（泳道支持交互点选） -->
              <div v-if="parsedRouteRules.length">
                <div class="cran-label mb-2">路由规则</div>
                <div v-if="parsedRouteRules.length === 1" class="cran-route-card">
                  <div class="cran-route-row">
                    <span class="cran-route-key">泳道</span>
                    <ContextItem
                      context-key="swimlane"
                      :value="parsedRouteRules[0].swimlane ?? ''"
                      label="泳道"
                      :fetch-items="fetchSwimlaneItems"
                      custom-edit
                      bare
                      @edit="item => onInfoSwimlaneEdit(item)"
                    >
                      <span v-if="parsedRouteRules[0].swimlane"
                            class="cran-swim-tag cran-swim-tag--clickable"
                            title="点击切换泳道（同步到触发表单）">
                        {{ parsedRouteRules[0].swimlane }}
                      </span>
                      <span v-else class="text-xs text-slate-400 cursor-pointer hover:text-slate-600 transition-colors"
                            title="点击选择泳道（同步到触发表单）">
                        主干（点击选择）
                      </span>
                    </ContextItem>
                  </div>
                  <div class="cran-route-row">
                    <span class="cran-route-key">cell</span>
                    <span class="text-xs font-mono text-slate-600">{{ parsedRouteRules[0].cell }}</span>
                  </div>
                  <div class="cran-route-row">
                    <span class="cran-route-key">grouptags</span>
                    <span class="text-xs font-mono text-slate-600">{{ parsedRouteRules[0].grouptags }}</span>
                  </div>
                </div>
                <div v-else class="rounded-lg overflow-hidden border border-slate-100">
                  <MonacoPreview :content="formatJson(drawer.task.routeRules!)" height="100px" />
                </div>
              </div>
            </n-tab-pane>

            <!-- ────── 手动触发 ────── -->
            <n-tab-pane name="trigger" tab="手动触发" class="space-y-4 pt-4">

              <!-- 触发结果 -->
              <div v-if="execResult" class="flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs"
                   :class="execResult.ok
                     ? 'bg-emerald-50 border border-emerald-100'
                     : 'bg-red-50 border border-red-100'">
                <span class="font-semibold mt-0.5 flex-shrink-0"
                      :class="execResult.ok ? 'text-emerald-500' : 'text-red-500'">
                  {{ execResult.ok ? '✓' : '✗' }}
                </span>
                <div>
                  <div class="font-medium" :class="execResult.ok ? 'text-emerald-700' : 'text-red-600'">
                    {{ execResult.ok ? '触发成功' : '触发失败' }}
                  </div>
                  <div class="font-mono text-[11px] mt-0.5 text-slate-500">
                    {{ execResult.ok ? execResult.attemptId : execResult.msg }}
                  </div>
                </div>
              </div>

              <!-- taskItem 编辑 -->
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <div class="cran-label">任务参数（taskItem）</div>
                  <button class="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                          @click="resetTaskItem">重置</button>
                </div>
                <div class="rounded-lg overflow-hidden border border-slate-200">
                  <LcMonacoEditor v-model="execTaskItem" language="json" height="160px" />
                </div>
              </div>

              <!-- 路由规则 编辑 -->
              <div>
                <div class="cran-label mb-2">路由规则（执行泳道）</div>
                <div class="cran-route-card">
                  <!-- 泳道 - ContextItem -->
                  <div class="cran-route-row">
                    <span class="cran-route-key">泳道</span>
                    <ContextItem
                      context-key="swimlane"
                      :value="execRule.swimlane ?? ''"
                      label="泳道"
                      :fetch-items="fetchSwimlaneItems"
                      custom-edit
                      bare
                      @edit="item => execRule.swimlane = item.value ?? ''"
                    >
                      <span class="cran-swim-chip"
                            :class="execRule.swimlane ? 'cran-swim-chip--active' : 'cran-swim-chip--empty'">
                        <span class="cran-swim-chip__dot" />
                        {{ execRule.swimlane || '主干（不指定）' }}
                      </span>
                    </ContextItem>
                    <button v-if="execRule.swimlane"
                            class="ml-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                            @click="execRule.swimlane = ''">清空</button>
                  </div>
                  <!-- cell -->
                  <div class="cran-route-row">
                    <span class="cran-route-key">cell</span>
                    <n-input v-model:value="execRule.cell" size="tiny"
                             class="max-w-36" style="font-family:monospace;font-size:12px" />
                  </div>
                  <!-- grouptags -->
                  <div class="cran-route-row">
                    <span class="cran-route-key">grouptags</span>
                    <n-input v-model:value="execRule.grouptags" size="tiny"
                             class="max-w-44" style="font-family:monospace;font-size:12px" />
                  </div>
                </div>
              </div>

              <!-- 触发按钮 -->
              <div class="flex items-center gap-3 pt-1">
                <n-button type="primary" size="small" :loading="executing" :disabled="executing" @click="doExecute">
                  触发执行
                </n-button>
                <span class="text-[11px] text-slate-400">成功后自动跳转历史记录</span>
              </div>
            </n-tab-pane>

            <!-- ────── 执行历史 ────── -->
            <n-tab-pane name="history" tab="执行历史" class="pt-4">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs text-slate-400">最近 {{ historyList.length }} 条</span>
                <n-button size="tiny" ghost :loading="historyLoading" @click="fetchHistory(1)">刷新</n-button>
              </div>

              <div v-if="historyLoading && !historyList.length" class="flex justify-center py-10">
                <n-spin :size="18" />
              </div>
              <div v-else-if="!historyList.length" class="flex flex-col items-center py-14 select-none">
                <Clock :size="28" class="mb-2 text-slate-200" />
                <div class="text-xs text-slate-400">暂无执行记录</div>
              </div>

              <div v-else class="space-y-2">
                <div v-for="item in historyList" :key="item.id"
                     class="cran-attempt"
                     :class="expandedAttempts.has(item.id) && 'cran-attempt--expanded'">
                  <!-- 左侧状态色条 -->
                  <div class="cran-attempt__bar"
                       :class="item.status === 7 ? 'bg-emerald-400'
                              : item.status === 8 ? 'bg-amber-400'
                              : item.status >= 5 ? 'bg-red-400'
                              : 'bg-slate-300'" />

                  <div class="flex-1 min-w-0">

                    <!-- ① 主行：状态 + attemptid ContextItem + 展开 + 重执行 -->
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="cran-status-pill flex-shrink-0"
                            :class="item.status === 7 ? 'cran-status-pill--ok'
                                   : item.status === 8 ? 'cran-status-pill--warn'
                                   : item.status >= 5 ? 'cran-status-pill--err'
                                   : 'cran-status-pill--idle'">
                        {{ STATUS_MAP[item.status] ?? `状态${item.status}` }}
                      </span>
                      <!-- attemptid：ContextItem（复制 + 在 Raptor 查看） -->
                      <ContextItem
                        context-key="attemptid"
                        :value="item.attemptid"
                        label="attemptid"
                        :editable="false"
                        :extra-actions="RAPTOR_ACTION"
                        bare
                        class="flex-1 min-w-0"
                        @action="key => handleAttemptAction(key, item)"
                      >
                        <span class="cran-chip-mono">{{ item.attemptid }}</span>
                      </ContextItem>
                      <!-- 展开 toggle -->
                      <button class="cran-expand-btn" @click.stop="toggleAttempt(item.id)">
                        {{ expandedAttempts.has(item.id) ? '▾' : '▸' }}
                      </button>
                      <n-button size="tiny" ghost class="flex-shrink-0" @click.stop="rerunAttempt(item)">
                        重执行
                      </n-button>
                    </div>

                    <!-- ② 路由信息：泳道 ContextItem + cell + grouptags -->
                    <template v-if="parseRouteRules(item.routeRules)?.[0]">
                      <div class="flex items-center gap-2 flex-wrap mt-2">
                        <ContextItem
                          context-key="swimlane"
                          :value="parseRouteRules(item.routeRules)![0].swimlane || ''"
                          label="泳道"
                          :fetch-items="fetchSwimlaneItems"
                          bare
                          @edit="i => execRule.swimlane = i.value ?? ''"
                        >
                          <span class="cran-swim-chip"
                                :class="parseRouteRules(item.routeRules)![0].swimlane
                                  ? 'cran-swim-chip--active' : 'cran-swim-chip--empty'">
                            <span class="cran-swim-chip__dot" />
                            {{ parseRouteRules(item.routeRules)![0].swimlane || '主干' }}
                          </span>
                        </ContextItem>
                        <span class="text-[11px] font-mono text-slate-400">
                          {{ parseRouteRules(item.routeRules)![0].cell }}
                        </span>
                        <span v-if="parseRouteRules(item.routeRules)![0].grouptags"
                              class="text-[11px] font-mono text-slate-300">
                          {{ parseRouteRules(item.routeRules)![0].grouptags }}
                        </span>
                      </div>
                    </template>

                    <!-- ③ 时间行：时间 · 耗时 · 机器 ContextItem -->
                    <div class="flex items-center gap-2 text-[11px] text-slate-400 mt-1.5">
                      <span>{{ formatTs(item.starttime) }}</span>
                      <template v-if="item.endtime && item.starttime && item.endtime > item.starttime">
                        <span class="text-slate-200">·</span>
                        <span>{{ ((item.endtime - item.starttime) / 1000).toFixed(1) }}s</span>
                      </template>
                      <span class="text-slate-200">·</span>
                      <ContextItem
                        context-key="exechost"
                        :value="item.exechost"
                        label="执行机器"
                        :editable="false"
                        bare
                      >
                        <span class="cran-chip-host">{{ item.exechost }}</span>
                      </ContextItem>
                    </div>

                    <!-- ④ 展开区：执行参数 taskItem -->
                    <template v-if="expandedAttempts.has(item.id)">
                      <div class="border-t border-slate-100 pt-2.5">
                        <div v-if="item.taskItem">
                          <div class="cran-label mb-1.5">执行参数（taskItem）</div>
                          <pre class="text-[10px] font-mono text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5 overflow-x-auto max-h-48 leading-relaxed">{{ formatJson(item.taskItem) }}</pre>
                        </div>
                        <div v-else class="text-[11px] text-slate-400 py-1">无执行参数</div>
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
  taskid: string; name: string; description: string; crontab: string
  status: number; appname: string; creator: string; taskitem: string
  routeRules?: string; executiontimeout?: number; waittimeout?: number
}
interface CranAttempt {
  id: number; attemptid: string; taskid: string
  starttime: number; endtime: number; status: number
  exechost: string; taskItem: string
  routeRules?: string   // API 返回字段名
}

// ─── 状态 ─────────────────────────────────────────────────────────────────────
const appkeyInput = ref<string | null>(null)
const tasks       = ref<CranTask[]>([])
const loading     = ref(false)
const loadingMsg  = ref('加载任务…')
const fromCache   = ref(false)
const searchText  = ref('')

// ✦ 缓存：appKey → CranTask[]（无限期，手动刷新清除）
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

// ─── 泳道 ContextItem ─────────────────────────────────────────────────────────
const fetchSwimlaneItems = makeFetchItems('swimlane')

// 任务信息 tab 的泳道点选 → 同步到触发表单
function onInfoSwimlaneEdit(item: ContextDataItem) {
  execRule.swimlane = item.value ?? ''
  message.info(item.value ? `泳道已同步：${item.value}` : '已清空泳道（主干）')
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
    if (Array.isArray(p) && p.length) return p as RouteRule[]
    if (typeof p === 'object' && p !== null) return [p as RouteRule]
  } catch {}
  return null
}

// ─── 计算 ─────────────────────────────────────────────────────────────────────
const parsedRouteRules = computed<RouteRule[]>(() =>
  parseRouteRules(drawer.value.task?.routeRules) ?? []
)

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

// Raptor 执行详情链接（以 attemptId 作为查询条件）
// TODO: 若 Raptor 是独立系统，请替换为实际 URL，如 https://raptor.sankuai.com/trace?q=xxx
function raptorUrl(attemptid: string) {
  return `${CRANE_BASE}/attempt/detail?attemptId=${encodeURIComponent(attemptid)}`
}

// attemptid ContextItem 的扩展操作
const RAPTOR_ACTION = [{ key: 'raptor', label: '在 Raptor 查看' }]
function handleAttemptAction(key: string, item: CranAttempt) {
  if (key === 'raptor') window.open(raptorUrl(item.attemptid), '_blank')
}

// ─── 全量拉取（翻页 + 缓存） ──────────────────────────────────────────────────
async function fetchAllTasks(forceRefresh = false) {
  if (!appkeyInput.value) return
  const appkey = appkeyInput.value

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
      loadingMsg.value = page > 1 ? `加载第 ${page} 页…` : '加载任务…'
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
    taskCache.value.set(appkey, [...tasks.value])
  } catch (e: any) {
    message.error(`加载失败：${e.message}`)
  } finally {
    loadingMsg.value = '加载任务…'
    loading.value = false
  }
}

function refreshTasks() {
  if (appkeyInput.value) {
    taskCache.value.delete(appkeyInput.value)
    fetchAllTasks(true)
  }
}

// ─── Appkey ────────────────────────────────────────────────────────────────────
const fetchAppkeyItems = makeFetchItems('appkey')

function onAppkeyEdit(item: ContextDataItem) {
  appkeyInput.value = item.value ?? null
  tasks.value = []
  if (appkeyInput.value) fetchAllTasks()
}

// ─── 打开详情抽屉 ──────────────────────────────────────────────────────────────
async function openDrawer(task: CranTask) {
  execResult.value       = null
  historyList.value      = []
  historyTotal.value     = 0
  historyPage.value      = 1
  drawerTab.value        = 'info'
  expandedAttempts.value = new Set()

  drawer.value = { show: true, task, loading: true }
  execTaskItem.value = formatJson(task.taskitem || '{}')

  try {
    const url  = `${CRANE_BASE}/task/detail?taskid=${encodeURIComponent(task.taskid)}`
    const json = await proxyGet<{ status: string; result?: CranTask }>(url, CRANE_HEADERS)
    if (json.status === 'success' && json.result) {
      drawer.value.task = { ...task, ...json.result }
      // 初始化路由规则编辑
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

// ─── 展开历史 ─────────────────────────────────────────────────────────────────
function toggleAttempt(id: number) {
  const s = new Set(expandedAttempts.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedAttempts.value = s
}

// ─── 基于历史重执行 ───────────────────────────────────────────────────────────
function rerunAttempt(item: CranAttempt) {
  execTaskItem.value = formatJson(item.taskItem || '{}')
  const rules = parseRouteRules(item.routeRules)
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

// ─── exechost 机器操作（待实现） ──────────────────────────────────────────────
function onExecHost(host: string) {
  message.info(`机器登录功能待实现：${host}`)
}

// ─── 手动触发 ─────────────────────────────────────────────────────────────────
async function doExecute() {
  if (!drawer.value.task) return
  const task = drawer.value.task
  executing.value  = true
  execResult.value = null

  let taskItemStr = execTaskItem.value.trim()
  try { taskItemStr = JSON.stringify(JSON.parse(taskItemStr)) } catch {}

  const routeRuleList = [{ ...execRule }]

  try {
    const url  = `${CRANE_BASE}/attempt/executeJob/${encodeURIComponent(task.taskid)}`
    const json = await proxyPost<{ status: string; result?: string; message?: string }>(
      url,
      { taskId: task.taskid, taskItem: taskItemStr, routeRuleList, hostName: '' },
      CRANE_HEADERS,
    )
    if (json.status === 'success') {
      execResult.value = { ok: true, attemptId: json.result }
      setTimeout(() => { drawerTab.value = 'history'; fetchHistory(1) }, 1200)
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
/* ── chip ── */
.cran-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 6px; font-size: 12px; line-height: 1.6;
  border: 1px solid; transition: background 0.12s, border-color 0.12s, color 0.12s;
  user-select: none; cursor: pointer; white-space: nowrap;
}
.cran-chip--slate  { background: #f1f5f9; border-color: #e2e8f0; color: #475569; }
.cran-chip--slate:hover { background: #e8ecf2; border-color: #c8d0db; }
.cran-chip--empty  { background: transparent; border-style: dashed; border-color: #cbd5e1; color: #94a3b8; cursor: default; }

/* ── attemptid chip ── */
.cran-chip-mono {
  display: inline-flex; align-items: center;
  font-family: monospace; font-size: 11.5px; color: #475569;
  background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px;
  padding: 2px 8px; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: background 0.1s, border-color 0.1s;
}
.cran-chip-mono:hover { background: #e8ecf4; border-color: #c8d2de; }

/* ── exechost chip ── */
.cran-chip-host {
  display: inline-flex; align-items: center;
  font-family: monospace; font-size: 11px; color: #64748b;
  background: #f8fafc; border: 1px solid #e8ecf4; border-radius: 5px;
  padding: 1px 7px;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.cran-chip-host:hover { background: #eef2ff; border-color: #c7d2fe; color: #4f46e5; }

/* ── 泳道 chip（触发表单内） ── */
.cran-swim-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px; border-radius: 5px; font-size: 12px;
  border: 1px solid; cursor: pointer; user-select: none;
  transition: all 0.1s;
}
.cran-swim-chip--active  { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
.cran-swim-chip--active:hover { background: #e0e7ff; border-color: #a5b4fc; }
.cran-swim-chip--empty   { background: transparent; border-style: dashed; border-color: #e2e8f0; color: #94a3b8; }
.cran-swim-chip__dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; background: currentColor; opacity: 0.5; }

/* ── 泳道标签（只读）── */
.cran-swim-tag {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-family: monospace;
  color: #4f46e5; background: #eef2ff; border: 1px solid #c7d2fe;
  padding: 1px 7px; border-radius: 5px;
}
.cran-swim-tag--clickable {
  cursor: pointer; transition: background 0.12s, border-color 0.12s;
}
.cran-swim-tag--clickable:hover { background: #e0e7ff; border-color: #a5b4fc; }

/* ── 键值对 ── */
.cran-kv { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px; padding: 8px 12px; }
.cran-kv__label { font-size: 10px; color: #94a3b8; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
.cran-kv__value { font-size: 12px; color: #374151; font-weight: 500; }

/* ── label ── */
.cran-label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; }

/* ── 路由规则卡片 ── */
.cran-route-card { background: #f8fafc; border: 1px solid #e8ecf4; border-radius: 8px; overflow: hidden; }
.cran-route-card--compact { background: transparent; border: 1px solid #f1f5f9; }
.cran-route-row { display: flex; align-items: center; gap: 10px; padding: 7px 12px; border-bottom: 1px solid #f1f5f9; }
.cran-route-row:last-child { border-bottom: none; }
.cran-route-key { width: 60px; flex-shrink: 0; font-size: 11px; color: #94a3b8; font-weight: 500; font-family: monospace; }

/* ── 状态徽章 ── */
.cran-status-pill {
  display: inline-flex; align-items: center;
  font-size: 11px; font-weight: 600;
  padding: 1px 7px; border-radius: 999px;
}
.cran-status-pill--ok   { color: #059669; background: #d1fae5; }
.cran-status-pill--warn { color: #d97706; background: #fef3c7; }
.cran-status-pill--err  { color: #dc2626; background: #fee2e2; }
.cran-status-pill--idle { color: #64748b; background: #f1f5f9; }

/* ── 展开 toggle ── */
.cran-expand-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 2px 4px; border-radius: 4px; flex-shrink: 0;
  font-size: 11px; color: #cbd5e1; line-height: 1;
  border: none; outline: none; background: transparent; cursor: pointer;
  transition: color 0.1s, background 0.1s;
}
.cran-expand-btn:hover { color: #5b6af0; background: #eef2ff; }

/* ── 执行历史条目 ── */
.cran-attempt {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 12px; border-radius: 8px;
  border: 1px solid #f1f5f9; background: #f8fafc;
  transition: border-color 0.12s, background 0.12s;
}
.cran-attempt:hover { background: #f1f5f9; border-color: #e2e8f0; }
.cran-attempt--expanded { border-color: #e0e7ff; background: #fafbff; }
.cran-attempt__bar {
  width: 3px; border-radius: 2px; flex-shrink: 0;
  align-self: stretch; min-height: 20px; margin-top: 1px;
}
</style>
