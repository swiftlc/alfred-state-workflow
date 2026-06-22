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
            <span>加载任务…</span>
          </span>
          <template v-else-if="appkeyInput">
            <span class="text-xs text-slate-400">{{ total }} 个任务</span>
          </template>
          <n-button size="tiny" :disabled="!appkeyInput || loading" ghost @click="fetchTasks(1)">刷新</n-button>
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
      <!-- 搜索框 -->
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
      />

      <!-- 分页 -->
      <div v-if="total > pageSize" class="shrink-0 flex justify-end mt-3">
        <n-pagination
          v-model:page="currentPage"
          :page-count="Math.ceil(total / pageSize)"
          :page-size="pageSize"
          size="small"
          @update:page="fetchTasks"
        />
      </div>
    </template>

    <!-- ── 任务详情抽屉 ── -->
    <n-drawer v-model:show="drawer.show" :width="580" placement="right">
      <n-drawer-content :native-scrollbar="false" closable>
        <template #header>
          <div class="min-w-0 pr-2">
            <div class="text-sm font-semibold text-slate-800 leading-snug truncate">
              {{ drawer.task?.description || drawer.task?.name || drawer.task?.taskid }}
            </div>
            <div class="text-[11px] text-slate-400 font-mono mt-0.5">{{ drawer.task?.taskid }}</div>
          </div>
        </template>

        <div v-if="drawer.loading" class="flex justify-center py-10">
          <n-spin />
        </div>
        <template v-else-if="drawer.task">

          <!-- 基本信息 -->
          <section class="mb-5">
            <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">基本信息</div>
            <div class="grid grid-cols-2 gap-y-2 gap-x-4">
              <div>
                <div class="text-[10px] text-slate-400 mb-0.5">任务 ID</div>
                <div class="text-xs font-mono text-slate-700">{{ drawer.task.taskid }}</div>
              </div>
              <div>
                <div class="text-[10px] text-slate-400 mb-0.5">状态</div>
                <span class="inline-flex items-center gap-1 text-xs">
                  <span class="w-1.5 h-1.5 rounded-full" :class="drawer.task.status === 2 ? 'bg-emerald-400' : 'bg-slate-300'" />
                  {{ drawer.task.status === 2 ? '已启用' : '已禁用' }}
                </span>
              </div>
              <div>
                <div class="text-[10px] text-slate-400 mb-0.5">Cron 表达式</div>
                <div class="text-xs font-mono text-indigo-600">{{ drawer.task.crontab }}</div>
              </div>
              <div>
                <div class="text-[10px] text-slate-400 mb-0.5">创建人</div>
                <div class="text-xs text-slate-700">{{ drawer.task.creator || '—' }}</div>
              </div>
              <div v-if="drawer.task.executiontimeout">
                <div class="text-[10px] text-slate-400 mb-0.5">执行超时（s）</div>
                <div class="text-xs text-slate-700">{{ drawer.task.executiontimeout }}</div>
              </div>
              <div v-if="drawer.task.waittimeout">
                <div class="text-[10px] text-slate-400 mb-0.5">等待超时（s）</div>
                <div class="text-xs text-slate-700">{{ drawer.task.waittimeout }}</div>
              </div>
            </div>
          </section>

          <!-- 任务类名 -->
          <section class="mb-5">
            <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">任务类</div>
            <div class="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 break-all">
              {{ drawer.task.name }}
            </div>
          </section>

          <!-- taskItem -->
          <section v-if="drawer.task.taskitem" class="mb-5">
            <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">任务参数（taskItem）</div>
            <pre class="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap break-all">{{ formatJson(drawer.task.taskitem) }}</pre>
          </section>

          <!-- 路由规则 -->
          <section v-if="drawer.task.routeRules" class="mb-5">
            <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">路由规则</div>
            <pre class="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap break-all">{{ formatJson(drawer.task.routeRules) }}</pre>
          </section>

          <!-- 手动触发 -->
          <section class="mb-6">
            <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">手动触发</div>
            <div class="bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-2">
              <div class="text-[11px] text-slate-500">taskItem（可编辑）</div>
              <textarea
                v-model="execTaskItem"
                rows="4"
                class="w-full text-xs font-mono bg-white border border-slate-200 rounded-md px-2.5 py-2 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 resize-y"
                placeholder='{"key":"value"}'
              />
              <div class="flex items-center gap-2">
                <n-button
                  size="small"
                  :loading="executing"
                  :disabled="executing"
                  @click="doExecute"
                >
                  触发执行
                </n-button>
                <span v-if="execResult" class="text-xs" :class="execResult.ok ? 'text-emerald-600' : 'text-red-500'">
                  {{ execResult.ok ? `✓ 已触发：${execResult.attemptId}` : `✗ ${execResult.msg}` }}
                </span>
              </div>
            </div>
          </section>

          <!-- 执行历史 -->
          <section>
            <div class="flex items-center justify-between mb-2">
              <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">执行历史</div>
              <n-button size="tiny" ghost :loading="historyLoading" @click="fetchHistory(1)">刷新</n-button>
            </div>
            <div v-if="historyLoading" class="flex justify-center py-6">
              <n-spin :size="14" />
            </div>
            <div v-else-if="!historyList.length" class="text-xs text-slate-400 text-center py-6">暂无执行记录</div>
            <div v-else class="space-y-2">
              <div
                v-for="item in historyList"
                :key="item.id"
                class="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="font-mono text-slate-500">{{ item.attemptid }}</span>
                  <span
                    class="text-[11px] font-medium px-1.5 py-0.5 rounded"
                    :class="item.status === 7
                      ? 'bg-emerald-50 text-emerald-600'
                      : item.status === 6
                      ? 'bg-red-50 text-red-600'
                      : 'bg-slate-100 text-slate-500'"
                  >
                    {{ STATUS_MAP[item.status] ?? `状态${item.status}` }}
                  </span>
                </div>
                <div class="flex items-center gap-3 text-slate-400">
                  <span>{{ formatTs(item.starttime) }}</span>
                  <span v-if="item.endtime && item.starttime">耗时 {{ ((item.endtime - item.starttime) / 1000).toFixed(1) }}s</span>
                  <span class="font-mono">{{ item.exechost }}</span>
                </div>
              </div>
              <!-- 历史分页 -->
              <div v-if="historyTotal > 10" class="flex justify-end pt-1">
                <n-pagination
                  v-model:page="historyPage"
                  :page-count="Math.ceil(historyTotal / 10)"
                  size="small"
                  @update:page="fetchHistory"
                />
              </div>
            </div>
          </section>

        </template>
      </n-drawer-content>
    </n-drawer>

  </div>
  </ContextGroup>
</template>

<script setup lang="ts">
import { ref, computed, h, watch } from 'vue'
import { Clock } from '@lucide/vue'
import { NDataTable, NInput, NPagination, NButton, NSpin, NDrawer, NDrawerContent } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import ContextItem from '@/components/ContextItem.vue'
import ContextGroup from '@/components/ContextGroup.vue'
import { matchQuery } from '@/utils/search'
import { makeFetchItems } from '@/utils/dict'
import { proxyGet, proxyPost } from '@/utils/proxy'
import type { ContextDataItem } from '@/types'

// ─── 执行状态映射 ────────────────────────────────────────────────────────────
const STATUS_MAP: Record<number, string> = {
  1:  '等待中',
  2:  '运行中',
  3:  '取消中',
  4:  '已取消',
  5:  '失败',
  6:  '执行失败',
  7:  '成功',
  8:  '超时',
  9:  '系统失败',
}

// ─── 类型 ─────────────────────────────────────────────────────────────────────
interface CranTask {
  taskid:    string
  name:      string
  description: string
  crontab:   string
  status:    number
  appname:   string
  creator:   string
  taskitem:  string
  routeRules?: string
  executiontimeout?: number
  waittimeout?: number
}
interface CranAttempt {
  id:        number
  attemptid: string
  taskid:    string
  starttime: number
  endtime:   number
  status:    number
  exechost:  string
  taskItem:  string
}

// ─── 状态 ─────────────────────────────────────────────────────────────────────
const appkeyInput  = ref<string | null>(null)
const tasks        = ref<CranTask[]>([])
const total        = ref(0)
const currentPage  = ref(1)
const pageSize     = 10
const loading      = ref(false)
const searchText   = ref('')

// ─── 详情抽屉 ─────────────────────────────────────────────────────────────────
const drawer = ref<{ show: boolean; task: CranTask | null; loading: boolean }>({
  show: false, task: null, loading: false,
})

// ─── 执行历史 ─────────────────────────────────────────────────────────────────
const historyList    = ref<CranAttempt[]>([])
const historyTotal   = ref(0)
const historyPage    = ref(1)
const historyLoading = ref(false)

// ─── 手动触发 ─────────────────────────────────────────────────────────────────
const execTaskItem = ref('')
const executing    = ref(false)
const execResult   = ref<{ ok: boolean; attemptId?: string; msg?: string } | null>(null)

// ─── localStorage 持久化 ──────────────────────────────────────────────────────
const LS_KEY = 'cran_appkey'
const _savedAppkey = localStorage.getItem(LS_KEY)
if (_savedAppkey) appkeyInput.value = _savedAppkey

watch(appkeyInput, v => {
  if (v) localStorage.setItem(LS_KEY, v)
  else   localStorage.removeItem(LS_KEY)
})

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function formatTs(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function formatJson(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2) }
  catch { return raw }
}

// ─── 过滤 ─────────────────────────────────────────────────────────────────────
const filteredTasks = computed(() => {
  const q = searchText.value.trim()
  if (!q) return tasks.value
  return tasks.value.filter(t =>
    matchQuery(q, t.taskid, t.name, t.description, t.crontab)
  )
})

// ─── 表格列 ──────────────────────────────────────────────────────────────────
const columns: DataTableColumns<CranTask> = [
  {
    title: '任务', key: 'name',
    render: (row) => h('div', { class: 'py-0.5' }, [
      h('div', { class: 'text-xs font-medium text-slate-700 truncate max-w-xs', title: row.name },
        row.description || row.name.split('.').pop() || row.name),
      h('div', { class: 'text-[10px] text-slate-400 font-mono mt-0.5 truncate', title: row.name },
        row.name),
    ]),
  },
  {
    title: 'Cron', key: 'crontab', width: 140,
    render: (row) => h('span', { class: 'text-xs font-mono text-indigo-600' }, row.crontab),
  },
  {
    title: '状态', key: 'status', width: 68,
    render: (row) => h('span', {
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
    render: (row) => h('span', { class: 'text-xs text-slate-500' }, row.creator || '—'),
  },
]

function rowProps(row: CranTask) {
  return {
    style: 'cursor:pointer',
    onClick: () => openDrawer(row),
  }
}

const CRANE_BASE = 'https://crane.mws-test.sankuai.com'
const CRANE_HEADERS = { 'x-requested-with': 'XMLHttpRequest' }

// ─── 获取任务列表 ─────────────────────────────────────────────────────────────
async function fetchTasks(page = currentPage.value) {
  if (!appkeyInput.value) return
  loading.value  = true
  currentPage.value = page
  try {
    const url = `${CRANE_BASE}/task/getTaskSlice?appKey=${encodeURIComponent(appkeyInput.value)}&pageNum=${page}&pageSize=${pageSize}`
    const json = await proxyGet<{ status: string; result?: { items: CranTask[]; total: number } }>(url, CRANE_HEADERS)
    if (json.status === 'success') {
      tasks.value = json.result?.items ?? []
      total.value = json.result?.total ?? 0
    } else {
      tasks.value = []
      total.value = 0
    }
  } catch { tasks.value = []; total.value = 0 }
  finally { loading.value = false }
}

// ─── Appkey 回调 ──────────────────────────────────────────────────────────────
const fetchAppkeyItems = makeFetchItems('appkey')

function onAppkeyEdit(item: ContextDataItem) {
  appkeyInput.value = item.value ?? null
  tasks.value = []
  total.value = 0
  currentPage.value = 1
  if (appkeyInput.value) fetchTasks(1)
}

// ─── 打开详情抽屉 ──────────────────────────────────────────────────────────────
async function openDrawer(task: CranTask) {
  execResult.value  = null
  historyList.value = []
  historyTotal.value = 0
  historyPage.value  = 1

  drawer.value = { show: true, task, loading: true }
  execTaskItem.value = (() => {
    try { return JSON.stringify(JSON.parse(task.taskitem), null, 2) }
    catch { return task.taskitem }
  })()

  // 拉取详情（含 routeRules）
  try {
    const url  = `${CRANE_BASE}/task/detail?taskid=${encodeURIComponent(task.taskid)}`
    const json = await proxyGet<{ status: string; result?: CranTask }>(url, CRANE_HEADERS)
    if (json.status === 'success' && json.result) {
      drawer.value.task = { ...task, ...json.result }
    }
  } catch {}
  drawer.value.loading = false

  // 拉取执行历史
  fetchHistory(1)
}

// ─── 执行历史 ─────────────────────────────────────────────────────────────────
async function fetchHistory(page = historyPage.value) {
  if (!drawer.value.task) return
  historyLoading.value = true
  historyPage.value    = page
  try {
    const url  = `${CRANE_BASE}/attempt/page/history?taskId=${encodeURIComponent(drawer.value.task.taskid)}&pageNum=${page}&pageSize=10`
    const json = await proxyGet<{ status: string; result?: { list: CranAttempt[]; total: number } }>(url, CRANE_HEADERS)
    if (json.status === 'success') {
      historyList.value  = json.result?.list ?? []
      historyTotal.value = json.result?.total ?? 0
    }
  } catch {}
  historyLoading.value = false
}

// ─── 手动触发 ─────────────────────────────────────────────────────────────────
async function doExecute() {
  if (!drawer.value.task) return
  const task = drawer.value.task
  executing.value  = true
  execResult.value = null

  // 解析 routeRules → routeRuleList
  let routeRuleList: unknown[] = []
  if (task.routeRules) {
    try {
      const parsed = JSON.parse(task.routeRules)
      routeRuleList = Array.isArray(parsed) ? parsed : [parsed]
    } catch {}
  }
  if (!routeRuleList.length) {
    routeRuleList = [{ cell: 'default', swimlane: '', grouptags: 'La:default' }]
  }

  // 解析 taskItem
  let taskItemStr = execTaskItem.value.trim()
  try { taskItemStr = JSON.stringify(JSON.parse(taskItemStr)) } catch {}

  try {
    const url  = `${CRANE_BASE}/attempt/executeJob/${encodeURIComponent(task.taskid)}`
    const json = await proxyPost<{ status: string; result?: string; message?: string }>(url, {
      taskId:        task.taskid,
      taskItem:      taskItemStr,
      routeRuleList,
      hostName:      '',
    }, CRANE_HEADERS)
    if (json.status === 'success') {
      execResult.value = { ok: true, attemptId: json.result }
      // 触发后刷新历史
      setTimeout(() => fetchHistory(1), 1200)
    } else {
      execResult.value = { ok: false, msg: json.message || '触发失败' }
    }
  } catch (e: any) {
    execResult.value = { ok: false, msg: e.message }
  }
  executing.value = false
}

// ─── appKey 变化时自动拉取 ────────────────────────────────────────────────────
watch(appkeyInput, (v) => {
  if (v) fetchTasks(1)
}, { immediate: true })
</script>

<style scoped>
/* chip 样式（与 OctoView 保持一致） */
.cran-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  border: 1px solid;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  user-select: none;
  cursor: pointer;
  white-space: nowrap;
}
.cran-chip--slate {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #475569;
}
.cran-chip--slate:hover { background: #e8ecf2; border-color: #c8d0db; }
.cran-chip--empty {
  background: transparent;
  border-style: dashed;
  border-color: #cbd5e1;
  color: #94a3b8;
  cursor: default;
}
</style>
