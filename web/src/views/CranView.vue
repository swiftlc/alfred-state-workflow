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
            <span class="text-xs text-slate-400">{{ tasks.length }} 个任务</span>
          </template>
          <n-button size="tiny" :disabled="!appkeyInput || loading" ghost @click="fetchAllTasks">刷新</n-button>
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

    <!-- ── 任务详情抽屉 ── -->
    <n-drawer v-model:show="drawer.show" :width="600" placement="right">
      <n-drawer-content :native-scrollbar="false" closable class="cran-drawer">
        <template #header>
          <div class="flex items-start gap-3 pr-2 min-w-0">
            <!-- 状态点 -->
            <div class="flex-shrink-0 mt-1">
              <span class="w-2 h-2 rounded-full block"
                    :class="drawer.task?.status === 2 ? 'bg-emerald-400' : 'bg-slate-300'" />
            </div>
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

          <!-- ── Tab 切换 ── -->
          <n-tabs v-model:value="drawerTab" type="line" size="small" class="cran-tabs">

            <!-- 详情 Tab -->
            <n-tab-pane name="info" tab="任务信息">
              <!-- 元信息卡片 -->
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
                <div class="cran-code-block text-[11px] break-all" @click="copyText(drawer.task.name)" title="点击复制">
                  {{ drawer.task.name }}
                </div>
              </div>

              <!-- taskItem（只读展示） -->
              <div v-if="drawer.task.taskitem" class="mb-4">
                <div class="cran-section-title mb-1.5">任务参数（taskItem）</div>
                <div class="border border-slate-100 rounded-lg overflow-hidden">
                  <MonacoPreview :content="formatJson(drawer.task.taskitem)" height="200px" />
                </div>
              </div>

              <!-- 路由规则 -->
              <div v-if="drawer.task.routeRules">
                <div class="cran-section-title mb-1.5">路由规则</div>
                <div class="border border-slate-100 rounded-lg overflow-hidden">
                  <MonacoPreview :content="formatJson(drawer.task.routeRules)" height="120px" />
                </div>
              </div>
            </n-tab-pane>

            <!-- 触发 Tab -->
            <n-tab-pane name="trigger" tab="手动触发">
              <div class="space-y-4">
                <!-- 触发结果 -->
                <div v-if="execResult" class="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
                     :class="execResult.ok
                       ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                       : 'bg-red-50 border border-red-100 text-red-600'">
                  <span class="flex-shrink-0 mt-0.5">{{ execResult.ok ? '✓' : '✗' }}</span>
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
                    <div class="cran-section-title">taskItem（可编辑）</div>
                    <button class="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                            @click="resetTaskItem">重置</button>
                  </div>
                  <div class="border border-slate-200 rounded-lg overflow-hidden">
                    <LcMonacoEditor v-model="execTaskItem" language="json" height="200px" />
                  </div>
                </div>

                <!-- 路由规则（泳道） -->
                <div v-if="drawer.task.routeRules">
                  <div class="cran-section-title mb-1.5">路由规则（routeRuleList）</div>
                  <div class="border border-slate-200 rounded-lg overflow-hidden">
                    <LcMonacoEditor v-model="execRouteRules" language="json" height="100px" />
                  </div>
                </div>

                <!-- 触发按钮 -->
                <div class="flex items-center gap-3 pt-1">
                  <n-button
                    type="primary"
                    size="small"
                    :loading="executing"
                    :disabled="executing"
                    @click="doExecute"
                  >
                    触发执行
                  </n-button>
                  <span class="text-[11px] text-slate-400">
                    执行后约 1s 自动刷新历史记录
                  </span>
                </div>
              </div>
            </n-tab-pane>

            <!-- 历史 Tab -->
            <n-tab-pane name="history" tab="执行历史">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs text-slate-400">最近 {{ historyList.length }} 条记录</span>
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
                >
                  <!-- 状态色条 -->
                  <div class="cran-attempt__bar"
                       :class="item.status === 7 ? 'bg-emerald-400' : item.status === 6 ? 'bg-red-400' : 'bg-slate-300'" />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-mono text-[11px] text-slate-500 truncate">{{ item.attemptid }}</span>
                      <span class="text-[11px] font-semibold ml-2 flex-shrink-0"
                            :class="item.status === 7
                              ? 'text-emerald-600'
                              : item.status === 6
                              ? 'text-red-500'
                              : 'text-slate-500'">
                        {{ STATUS_MAP[item.status] ?? `状态${item.status}` }}
                      </span>
                    </div>
                    <div class="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                      <span>{{ formatTs(item.starttime) }}</span>
                      <span v-if="item.endtime && item.starttime" class="text-slate-300">·</span>
                      <span v-if="item.endtime && item.starttime">
                        {{ ((item.endtime - item.starttime) / 1000).toFixed(1) }}s
                      </span>
                      <span class="text-slate-300">·</span>
                      <span class="font-mono">{{ item.exechost }}</span>
                    </div>
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
import { ref, computed, h, watch } from 'vue'
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
const appkeyInput = ref<string | null>(null)
const tasks       = ref<CranTask[]>([])
const loading     = ref(false)
const loadingMsg  = ref('加载任务…')
const searchText  = ref('')

// ─── 抽屉 ─────────────────────────────────────────────────────────────────────
const drawer    = ref<{ show: boolean; task: CranTask | null; loading: boolean }>({
  show: false, task: null, loading: false,
})
const drawerTab = ref<'info' | 'trigger' | 'history'>('info')

// ─── 执行历史 ─────────────────────────────────────────────────────────────────
const historyList    = ref<CranAttempt[]>([])
const historyTotal   = ref(0)
const historyPage    = ref(1)
const historyLoading = ref(false)

// ─── 手动触发 ─────────────────────────────────────────────────────────────────
const execTaskItem   = ref('')
const execRouteRules = ref('[]')
const executing      = ref(false)
const execResult     = ref<{ ok: boolean; attemptId?: string; msg?: string } | null>(null)

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

// ─── 全量拉取任务（自动翻页） ──────────────────────────────────────────────────
async function fetchAllTasks() {
  if (!appkeyInput.value) return
  loading.value = true
  tasks.value   = []
  const PAGE_SIZE = 50
  let page = 1
  let fetched = 0

  try {
    while (true) {
      loadingMsg.value = `加载第 ${page} 页…`
      const url  = `${CRANE_BASE}/task/getTaskSlice?appKey=${encodeURIComponent(appkeyInput.value)}&pageNum=${page}&pageSize=${PAGE_SIZE}`
      const json = await proxyGet<{
        status: string
        result?: { items: CranTask[]; total: number; pages: number }
      }>(url, CRANE_HEADERS)

      if (json.status !== 'success' || !json.result) break

      const items  = json.result.items ?? []
      tasks.value.push(...items)
      fetched += items.length

      if (page >= json.result.pages || items.length < PAGE_SIZE) break
      page++
    }
  } catch (e: any) {
    message.error(`加载任务失败：${e.message}`)
  } finally {
    loadingMsg.value = '加载任务…'
    loading.value = false
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
  execResult.value  = null
  historyList.value = []
  historyTotal.value = 0
  historyPage.value  = 1
  drawerTab.value    = 'info'

  drawer.value = { show: true, task, loading: true }

  // 初始化 taskItem 编辑内容
  execTaskItem.value = formatJson(task.taskitem || '{}')

  // 拉取详情（含 routeRules）
  try {
    const url  = `${CRANE_BASE}/task/detail?taskid=${encodeURIComponent(task.taskid)}`
    const json = await proxyGet<{ status: string; result?: CranTask }>(url, CRANE_HEADERS)
    if (json.status === 'success' && json.result) {
      drawer.value.task = { ...task, ...json.result }
      // 初始化路由规则
      if (json.result.routeRules) {
        execRouteRules.value = formatJson(json.result.routeRules)
      }
    }
  } catch {}
  drawer.value.loading = false
  fetchHistory(1)
}

// ─── 重置 taskItem ────────────────────────────────────────────────────────────
function resetTaskItem() {
  if (drawer.value.task) {
    execTaskItem.value = formatJson(drawer.value.task.taskitem || '{}')
  }
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

// ─── 手动触发 ─────────────────────────────────────────────────────────────────
async function doExecute() {
  if (!drawer.value.task) return
  const task = drawer.value.task
  executing.value  = true
  execResult.value = null

  // 解析路由规则
  let routeRuleList: unknown[] = []
  try {
    const parsed = JSON.parse(execRouteRules.value)
    routeRuleList = Array.isArray(parsed) ? parsed : [parsed]
  } catch {}
  if (!routeRuleList.length) {
    routeRuleList = [{ cell: 'default', swimlane: '', grouptags: 'La:default' }]
  }

  // 解析 taskItem（压缩）
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
.cran-chip--slate { background: #f1f5f9; border-color: #e2e8f0; color: #475569; }
.cran-chip--slate:hover { background: #e8ecf2; border-color: #c8d0db; }
.cran-chip--empty { background: transparent; border-style: dashed; border-color: #cbd5e1; color: #94a3b8; cursor: default; }

/* ── 抽屉 tab 紧凑 ─────────────────────────────────────────────────────────── */
.cran-tabs :deep(.n-tabs-nav) {
  margin-bottom: 16px;
}

/* ── 元信息卡片 ─────────────────────────────────────────────────────────────── */
.cran-meta-item {
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  padding: 8px 12px;
}
.cran-meta-label {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 3px;
}
.cran-meta-value { font-size: 12px; color: #374151; font-weight: 500; }

/* ── section title ──────────────────────────────────────────────────────────── */
.cran-section-title {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── 只读代码块 ─────────────────────────────────────────────────────────────── */
.cran-code-block {
  background: #f8fafc;
  border: 1px solid #e8ecf4;
  border-radius: 8px;
  padding: 8px 12px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  color: #475569;
  cursor: pointer;
  transition: background 0.12s;
}
.cran-code-block:hover { background: #f1f5f9; }

/* ── 执行历史条目 ────────────────────────────────────────────────────────────── */
.cran-attempt {
  display: flex;
  align-items: stretch;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  padding: 9px 12px;
  transition: border-color 0.12s, background 0.12s;
}
.cran-attempt:hover { background: #f1f5f9; border-color: #e2e8f0; }
.cran-attempt__bar {
  width: 3px;
  border-radius: 2px;
  flex-shrink: 0;
}
</style>
