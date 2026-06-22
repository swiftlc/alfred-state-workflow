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
            <n-tab-pane name="info" tab="任务信息">
            <div class="flex flex-col gap-4 pt-4">

              <!-- ① MMC stat 卡：状态 / 创建人 / 超时（紧凑横排） -->
              <div class="grid grid-cols-3 gap-3">
                <!-- 状态 -->
                <div class="cran-stat-card">
                  <div class="flex items-center gap-2">
                    <div class="cran-stat-icon"
                         :class="drawer.task.status === 2 ? 'bg-emerald-50' : 'bg-slate-100'">
                      <CheckCircle2 v-if="drawer.task.status === 2" :size="14" class="text-emerald-500" />
                      <XCircle v-else :size="14" class="text-slate-400" />
                    </div>
                    <div>
                      <div class="cran-stat-value"
                           :class="drawer.task.status === 2 ? 'text-emerald-600' : 'text-slate-400'">
                        {{ drawer.task.status === 2 ? '已启用' : '已禁用' }}
                      </div>
                      <div class="cran-stat-label">运行状态</div>
                    </div>
                  </div>
                </div>
                <!-- 创建人 -->
                <div class="cran-stat-card">
                  <div class="flex items-center gap-2">
                    <div class="cran-stat-icon bg-indigo-50">
                      <User :size="14" class="text-indigo-400" />
                    </div>
                    <div class="min-w-0">
                      <div class="cran-stat-value truncate">{{ drawer.task.creator || '—' }}</div>
                      <div class="cran-stat-label">创建人</div>
                    </div>
                  </div>
                </div>
                <!-- 超时 -->
                <div class="cran-stat-card">
                  <div class="flex items-center gap-2">
                    <div class="cran-stat-icon bg-amber-50">
                      <Timer :size="14" class="text-amber-400" />
                    </div>
                    <div>
                      <div class="cran-stat-value">
                        {{ drawer.task.executiontimeout ? `${drawer.task.executiontimeout}s` : '—' }}
                      </div>
                      <div class="cran-stat-label">执行超时</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ② 任务类名 -->
              <div class="cran-code-block" @click="copyText(drawer.task.name)" title="点击复制">
                <Code2 :size="12" class="text-slate-300 flex-shrink-0 mt-0.5" />
                <span class="font-mono text-[11px] text-slate-500 break-all leading-relaxed">
                  {{ drawer.task.name }}
                </span>
              </div>

              <!-- ③ 路由规则 -->
              <div v-if="parsedRouteRules.length">
                <div class="cran-section-label mb-2">路由规则</div>
                <div v-if="parsedRouteRules.length === 1"
                     class="flex items-center gap-2.5 flex-wrap">
                  <ContextItem
                    context-key="swimlane"
                    :value="parsedRouteRules[0].swimlane ?? ''"
                    label="泳道"
                    :fetch-items="fetchSwimlaneItems"
                    custom-edit
                    bare
                    @edit="item => onInfoSwimlaneEdit(item)"
                  >
                    <span class="cran-swim-chip"
                          :class="parsedRouteRules[0].swimlane
                            ? 'cran-swim-chip--active' : 'cran-swim-chip--empty'"
                          title="点击切换泳道（同步到触发表单）">
                      <span class="cran-swim-chip__dot" />
                      {{ parsedRouteRules[0].swimlane || '主干' }}
                    </span>
                  </ContextItem>
                  <span class="text-[11.5px] font-mono text-slate-500">{{ parsedRouteRules[0].cell }}</span>
                  <span v-if="parsedRouteRules[0].grouptags"
                        class="text-[11px] font-mono text-slate-400">
                    {{ parsedRouteRules[0].grouptags }}
                  </span>
                </div>
                <div v-else class="rounded-lg overflow-hidden border border-slate-100 mt-2">
                  <MonacoPreview :content="formatJson(drawer.task.routeRules!)" height="160px" compact />
                </div>
              </div>

              <!-- ④ 任务参数 -->
              <div v-if="drawer.task.taskitem">
                <div class="cran-section-label mb-2">任务参数</div>
                <div class="rounded-xl overflow-hidden border border-slate-100">
                  <MonacoPreview :content="formatJson(drawer.task.taskitem)" height="400px" compact />
                </div>
              </div>
            </div>
            </n-tab-pane>

            <!-- ────── 手动触发 ────── -->
            <n-tab-pane name="trigger" tab="手动触发">
            <div class="flex flex-col gap-4 pt-4">

              <!-- 触发结果 Banner -->
              <div v-if="execResult"
                   class="flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-medium"
                   :class="execResult.ok
                     ? 'bg-emerald-50 border border-emerald-200'
                     : 'bg-red-50 border border-red-200'">
                <span class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                      :class="execResult.ok ? 'bg-emerald-400' : 'bg-red-400'">
                  {{ execResult.ok ? '✓' : '✗' }}
                </span>
                <div class="min-w-0">
                  <div :class="execResult.ok ? 'text-emerald-700' : 'text-red-600'">
                    {{ execResult.ok ? '触发成功' : '触发失败' }}
                  </div>
                  <div class="font-mono text-[10.5px] mt-0.5 text-slate-500 truncate">
                    {{ execResult.ok ? execResult.attemptId : execResult.msg }}
                  </div>
                </div>
              </div>

              <!-- taskItem 编辑 -->
              <div>
                <div class="flex items-center justify-between mb-3">
                  <div class="cran-section-label">任务参数</div>
                  <button class="text-[11px] text-slate-400 hover:text-indigo-500 transition-colors
                                 border-0 bg-transparent outline-none cursor-pointer p-0"
                          @click="resetTaskItem">重置</button>
                </div>
                <div class="rounded-xl overflow-hidden border border-slate-200">
                  <LcMonacoEditor v-model="execTaskItem" language="json" height="320px" compact />
                </div>
              </div>

              <!-- 路由规则 编辑 -->
              <div>
                <div class="cran-section-label mb-2">路由规则</div>
                <div class="cran-route-card">
                  <!-- 泳道 -->
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
                            class="ml-2 text-[11px] text-slate-400 hover:text-red-400 transition-colors
                                   border-0 bg-transparent outline-none cursor-pointer p-0"
                            @click="execRule.swimlane = ''">清空</button>
                  </div>
                  <!-- cell -->
                  <div class="cran-route-row">
                    <span class="cran-route-key">cell</span>
                    <n-input v-model:value="execRule.cell" size="tiny"
                             class="max-w-40" style="font-family:monospace;font-size:12px" />
                  </div>
                  <!-- grouptags -->
                  <div class="cran-route-row">
                    <span class="cran-route-key">grouptags</span>
                    <n-input v-model:value="execRule.grouptags" size="tiny"
                             class="max-w-48" style="font-family:monospace;font-size:12px" />
                  </div>
                </div>
              </div>

              <!-- 触发按钮 -->
              <div class="flex items-center justify-between pt-1">
                <n-button type="primary" size="medium" :loading="executing" :disabled="executing"
                          @click="doExecute">
                  触发执行
                </n-button>
                <span class="text-[11px] text-slate-400">触发成功后自动跳转历史记录</span>
              </div>
            </div>
            </n-tab-pane>

            <!-- ────── 执行历史 ────── -->
            <n-tab-pane name="history" tab="执行历史">
            <div class="pt-4">

              <!-- KPI strip（MMC 风格横向指标卡） -->
              <div v-if="historyList.length" class="grid grid-cols-4 gap-3 mb-4">
                <div class="cran-kpi-card">
                  <div class="cran-kpi-val">{{ historyStats.total }}</div>
                  <div class="cran-kpi-label">总执行次数</div>
                </div>
                <div class="cran-kpi-card">
                  <div class="cran-kpi-val"
                       :class="historyStats.rate >= 90 ? 'text-emerald-600'
                              : historyStats.rate >= 70 ? 'text-amber-500'
                              : 'text-red-500'">
                    {{ historyStats.rate }}%
                  </div>
                  <div class="cran-kpi-label">成功率</div>
                </div>
                <div class="cran-kpi-card">
                  <div class="cran-kpi-val">{{ historyStats.avg }}<span v-if="historyStats.avg !== '—'" class="text-[11px] font-normal text-slate-400 ml-0.5">s</span></div>
                  <div class="cran-kpi-label">平均耗时</div>
                </div>
                <div class="cran-kpi-card">
                  <div class="cran-kpi-val"
                       :class="historyStats.err > 0 ? 'text-red-500' : 'text-slate-700'">
                    {{ historyStats.err }}
                  </div>
                  <div class="cran-kpi-label">失败次数</div>
                </div>
              </div>

              <!-- 状态筛选 + 刷新 -->
              <div class="flex items-center gap-1.5 mb-3 flex-wrap">
                <button v-for="f in [
                  { key: 'all', label: '全部' },
                  { key: 'ok',  label: '成功' },
                  { key: 'run', label: '运行中' },
                  { key: 'err', label: '失败' },
                ]" :key="f.key"
                  class="cran-filter-chip"
                  :class="historyFilter === f.key && 'cran-filter-chip--active'"
                  @click="historyFilter = f.key as any">
                  {{ f.label }}
                </button>
                <div class="flex-1" />
                <n-button size="tiny" text :loading="historyLoading" @click="fetchHistory(1)">刷新</n-button>
              </div>

              <div v-if="historyLoading && !historyList.length" class="flex justify-center py-10">
                <n-spin :size="18" />
              </div>
              <div v-else-if="!historyList.length" class="flex flex-col items-center py-12 select-none">
                <Clock :size="28" class="mb-2 text-slate-200" />
                <div class="text-xs text-slate-400">暂无执行记录</div>
              </div>
              <div v-else-if="!filteredHistory.length" class="flex flex-col items-center py-8 select-none">
                <div class="text-xs text-slate-400">当前筛选无结果</div>
              </div>

              <div v-else class="flex flex-col gap-2.5">
                <div v-for="item in filteredHistory" :key="item.id"
                     class="cran-attempt"
                     :class="expandedAttempts.has(item.id) && 'cran-attempt--expanded'">
                  <!-- 左侧状态色条 -->
                  <div class="cran-attempt__bar" :class="statusBarClass(item.status)" />

                  <div class="flex-1 min-w-0">

                    <!-- ① 主行：状态 + attemptid(自适应宽) + 弹性空白 + 重执行 + ▸ -->
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="cran-status-pill flex-shrink-0" :class="statusPillClass(item.status)">
                        {{ statusLabel(item.status) }}
                      </span>
                      <!-- attemptid：内容自适应宽，不再 flex-1 撑满 -->
                      <ContextItem
                        context-key="attemptid"
                        :value="item.attemptid"
                        label="attemptid"
                        :editable="false"
                        :extra-actions="RAPTOR_ACTION"
                        bare
                        class="min-w-0 flex-shrink"
                        @action="key => handleAttemptAction(key, item)"
                      >
                        <span class="cran-chip-mono">{{ item.attemptid }}</span>
                      </ContextItem>
                      <!-- 弹性空白把右侧操作推到末尾 -->
                      <div class="flex-1" />
                      <n-button size="tiny" ghost class="flex-shrink-0" @click.stop="rerunAttempt(item)">
                        重执行
                      </n-button>
                      <!-- 展开 toggle 放最右 -->
                      <button class="cran-expand-btn" @click.stop="toggleAttempt(item.id)">
                        {{ expandedAttempts.has(item.id) ? '▾' : '▸' }}
                      </button>
                    </div>

                    <!-- ② 路由信息：泳道 + cell + grouptags -->
                    <template v-if="parseRouteRules(item.routeRules)?.[0]">
                      <div class="flex items-center gap-2 flex-wrap mt-1">
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

                    <!-- ③ 时间行：时间 · 耗时 · 机器（纯文字，去掉 chip） -->
                    <div class="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
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
                        :extra-actions="MACHINE_ACTION"
                        bare
                        @action="key => handleMachineAction(key, item.exechost)"
                      >
                        <span class="cran-chip-host">{{ item.exechost }}</span>
                      </ContextItem>
                    </div>

                    <!-- ④ 展开区：执行参数 taskItem（Monaco + 复制） -->
                    <template v-if="expandedAttempts.has(item.id)">
                      <div class="border-t border-slate-100 pt-2.5">
                        <div v-if="item.taskItem">
                          <div class="flex items-center justify-between mb-1.5">
                            <div class="cran-section-label">执行参数（taskItem）</div>
                            <button
                              class="flex items-center gap-1 text-[11px] text-slate-400
                                     hover:text-indigo-500 transition-colors border-0
                                     bg-transparent outline-none cursor-pointer p-0"
                              @click.stop="copyText(formatJson(item.taskItem))">
                              <Copy :size="11" />复制
                            </button>
                          </div>
                          <div class="rounded-lg overflow-hidden border border-slate-100">
                            <MonacoPreview :content="formatJson(item.taskItem)" height="200px" compact />
                          </div>
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
import { Clock, User, Timer, CheckCircle2, XCircle, Code2, Copy } from '@lucide/vue'
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
  6: '运行中',
  7: '成功',
  8: '失败',
}
function statusLabel(status: number) {
  return STATUS_MAP[status] ?? '未知'
}
// 状态颜色辅助
function statusPillClass(status: number) {
  if (status === 7) return 'cran-status-pill--ok'
  if (status === 8) return 'cran-status-pill--err'
  if (status === 6) return 'cran-status-pill--warn'
  return 'cran-status-pill--idle'
}
function statusBarClass(status: number) {
  if (status === 7) return 'bg-emerald-400'
  if (status === 8) return 'bg-red-400'
  if (status === 6) return 'bg-amber-400'
  return 'bg-slate-300'
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
const historyFilter    = ref<'all' | 'ok' | 'err' | 'run'>('all')

const filteredHistory = computed(() => {
  if (historyFilter.value === 'all') return historyList.value
  if (historyFilter.value === 'ok')  return historyList.value.filter(i => i.status === 7)
  if (historyFilter.value === 'err') return historyList.value.filter(i => i.status === 8)
  if (historyFilter.value === 'run') return historyList.value.filter(i => i.status === 6)
  return historyList.value
})

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

// ─── Raptor 日志跳转（appkey + attemptid + 时间窗口） ─────────────────────────
const RAPTOR_BASE = 'https://raptor.mws-test.sankuai.com/log/topic/view'

function raptorUrl(item: CranAttempt) {
  const appkey = appkeyInput.value ?? ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  // 以 attempt 开始时间为中心，前 2min / 后 15min 作为时间窗口
  const ts = item.starttime ? new Date(item.starttime) : new Date()
  const start = fmt(new Date(ts.getTime() - 2  * 60 * 1000))
  const end   = fmt(new Date(ts.getTime() + 15 * 60 * 1000))
  const params = new URLSearchParams({
    searchType: 'expert', searchGrammar: 'dsl',
    condition:  `"${item.attemptid}"`,
    timeType:   '5m~0m', startDate: start, endDate: end,
    iSLimit: '100', globalCityId: '1', pageNum: '1', pageSize: '50',
  })
  return `${RAPTOR_BASE}/${encodeURIComponent(appkey)}?${params.toString()}`
}

// ─── 机器跳转（IP:Port → 内部 Falcon 或 web-ssh） ────────────────────────────
// TODO: 替换为实际机器跳转 URL（如 https://falcon.sankuai.com/host/{ip}）
function machineUrl(exechost: string) {
  return `http://${exechost}` // 占位：直连机器端口，可按需改为 Falcon 等
}

// attemptid 操作
const RAPTOR_ACTION = [{ key: 'raptor', label: '在 Raptor 查看' }]
function handleAttemptAction(key: string, item: CranAttempt) {
  if (key === 'raptor') window.open(raptorUrl(item), '_blank')
}

// 机器操作
const MACHINE_ACTION = [{ key: 'machine', label: '跳转机器' }]
function handleMachineAction(key: string, host: string) {
  if (key === 'machine') window.open(machineUrl(host), '_blank')
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

  const PAGE_SIZE = 150
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

// ─── 历史 KPI 统计 ────────────────────────────────────────────────────────────
const historyStats = computed(() => {
  const list = historyList.value
  const total = list.length
  const ok  = list.filter(i => i.status === 7).length
  const err = list.filter(i => i.status === 8).length
  const durations = list
    .filter(i => i.endtime && i.starttime && i.endtime > i.starttime)
    .map(i => (i.endtime - i.starttime) / 1000)
  const avg = durations.length
    ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1)
    : '—'
  return { total, ok, err, rate: total ? Math.round(ok / total * 100) : 0, avg }
})

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

/* ── exechost chip（服务器 IP:Port）── */
.cran-chip-host {
  display: inline-flex; align-items: center;
  font-family: monospace; font-size: 11px; color: #475569;
  background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 5px;
  padding: 1px 7px;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.cran-chip-host:hover { background: #eef2ff; border-color: #c7d2fe; color: #4f46e5; }

/* ── attemptid chip ── */
.cran-chip-mono {
  display: inline-flex; align-items: center;
  font-family: monospace; font-size: 11.5px; color: #475569;
  background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px;
  padding: 2px 8px; max-width: 300px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: background 0.1s, border-color 0.1s;
}
.cran-chip-mono:hover { background: #e8ecf4; border-color: #c8d2de; }


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

/* ── 信息行 ── */
.cran-info-row { display: flex; align-items: center; gap: 12px; min-width: 0; }
.cran-info-key { font-size: 11px; color: #94a3b8; flex-shrink: 0; }
.cran-info-val { font-size: 12.5px; color: #374151; font-weight: 500; }

/* ── 分区标题 ── */
.cran-section-label { font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.02em; }

/* ── MMC stat 卡（任务信息 3 格，横排紧凑）── */
.cran-stat-card {
  background: #f8fafc; border: 1px solid #e8ecf4; border-radius: 10px;
  padding: 10px 12px;
}
.cran-stat-icon {
  width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.cran-stat-value { font-size: 13px; font-weight: 700; color: #1e293b; line-height: 1.3; }
.cran-stat-label { font-size: 10px; color: #94a3b8; margin-top: 1px; }

/* ── 任务类 code block ── */
.cran-code-block {
  display: flex; align-items: flex-start; gap: 8px;
  background: #f8fafc; border: 1px solid #e8ecf4; border-radius: 10px;
  padding: 8px 12px; cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.cran-code-block:hover { background: #f1f5f9; border-color: #c7d2fe; }

/* ── KPI strip（执行历史顶部）── */
.cran-kpi-card {
  background: #f8fafc; border: 1px solid #e8ecf4; border-radius: 10px;
  padding: 10px 12px; text-align: center;
}
.cran-kpi-val { font-size: 18px; font-weight: 700; color: #1e293b; line-height: 1.2; }
.cran-kpi-label { font-size: 10px; color: #94a3b8; margin-top: 2px; white-space: nowrap; }

/* ── 状态筛选 pill chip ── */
.cran-filter-chip {
  display: inline-flex; align-items: center;
  font-size: 11.5px; color: #94a3b8;
  padding: 3px 12px; border-radius: 999px;
  border: 1px solid #e8ecf4; background: transparent;
  cursor: pointer; transition: all 0.12s; outline: none;
}
.cran-filter-chip:hover { color: #5b6af0; border-color: #c7d2fe; background: #eef2ff; }
.cran-filter-chip--active { color: #4f46e5; border-color: #a5b4fc; background: #eef2ff; font-weight: 600; }

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
  padding: 12px 14px; border-radius: 8px;
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
