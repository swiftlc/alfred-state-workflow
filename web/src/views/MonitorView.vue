<template>
  <div class="flex flex-col overflow-hidden" style="height: 100%">
    <div class="flex items-center justify-between mb-5 shrink-0">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">环境嗅探</h1>
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1.5 text-xs text-slate-400">
          <span :class="['inline-block w-2 h-2 rounded-full transition-colors', pollingDotClass]" />
          {{ pollingLabel }}
        </span>
        <n-button size="small" :loading="loading" @click="doRefresh">刷新</n-button>
      </div>
    </div>

    <!-- 当前嗅探状态卡片 -->
    <div class="grid grid-cols-2 gap-3 mb-6 shrink-0">
      <div
        v-for="src in SOURCES" :key="src.key"
        :class="['border rounded-lg p-3 bg-white', cardBorderClass(statuses[src.key])]"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <component :is="src.icon" :size="13" />
            {{ src.label }}
          </span>
          <span :class="['text-xs px-1.5 py-0.5 rounded font-medium', statusBadgeClass(statuses[src.key])]">
            {{ statusText(statuses[src.key]) }}
          </span>
        </div>

        <p class="text-xs font-mono text-slate-500 truncate mb-2 min-h-[1.25em]">
          {{ statuses[src.key]?.contentPreview || '暂无数据' }}
        </p>

        <ContextTags
          v-if="statuses[src.key]?.finalResult?.contexts?.length"
          :data="sensingContextsToData(statuses[src.key]!.finalResult!.contexts)"
          :editable="true"
          class="mb-2"
          @select="onContextTagSelect"
          @apply-all="onContextApplyAll"
        />

        <div class="flex gap-1.5 flex-wrap">
          <n-button
            size="tiny" ghost
            :disabled="!statuses[src.key]?.id"
            @click="openDetail(statuses[src.key]!.id)"
          >详情</n-button>
          <n-button
            size="tiny" ghost
            :disabled="!statuses[src.key]?.id || !!statuses[src.key]?.dismissed"
            @click="doDismiss(src.key)"
          >忽略</n-button>
        </div>
      </div>
    </div>

    <!-- 历史记录 -->
    <TabTable
      v-model="activeHistTab"
      :tabs="SOURCES.map(s => ({ key: s.key, label: s.histLabel }))"
      class="flex-1 min-h-0"
    >
      <template #default="{ height }">
        <n-data-table
          :columns="histColumns"
          :data="histories[activeHistTab] ?? []"
          :loading="histLoading"
          :bordered="false"
          :single-line="false"
          size="small"
          :max-height="height || undefined"
        />
      </template>
    </TabTable>

    <!-- 详情抽屉 -->
    <n-drawer v-model:show="detail.show" :width="520">
      <n-drawer-content title="快照详情" :native-scrollbar="false" closable>
        <div v-if="detail.loading" class="flex justify-center py-12">
          <n-spin />
        </div>
        <template v-else-if="detail.snap">
          <!-- 原始内容 -->
          <div class="mb-4">
            <p class="text-xs text-slate-400 mb-1 font-medium">原始内容</p>
            <n-image-group v-if="isImageContent(detail.snap)">
              <n-image
                :src="detail.snap.changeEvent?.content ?? detail.snap.contentPreview"
                object-fit="contain"
                style="width: 100%; border-radius: 6px; cursor: zoom-in"
                :img-props="{ style: 'max-height: 280px; width: 100%; object-fit: contain; border-radius: 6px; display: block' }"
              />
            </n-image-group>
            <pre v-else class="text-xs bg-slate-50 p-2 rounded overflow-auto max-h-44 whitespace-pre-wrap break-all font-mono leading-relaxed">{{ detail.snap.changeEvent?.content ?? detail.snap.contentPreview }}</pre>
          </div>

          <!-- 解析流程 -->
          <div class="mb-4">
            <p class="text-xs text-slate-400 mb-2 font-medium">解析流程</p>
            <div
              v-for="stage in detail.snap.stages ?? []" :key="stage.name"
              class="flex items-center gap-2 text-xs py-1.5 border-b border-slate-50 last:border-0"
            >
              <span :class="['w-1.5 h-1.5 rounded-full flex-shrink-0', stageColor(stage.status)]" />
              <span class="text-slate-600 w-20 flex-shrink-0">{{ STAGE_LABELS[stage.name] ?? stage.name }}</span>
              <span class="text-slate-400">{{ stage.durationMs != null ? stage.durationMs + 'ms' : '—' }}</span>
              <span v-if="stage.result?.contexts?.length" class="ml-auto text-indigo-500 flex-shrink-0">
                {{ stage.result.contexts.length }} 个上下文
              </span>
              <span
                v-if="stage.error" class="ml-auto text-red-400 truncate max-w-[140px]"
                :title="stage.error"
              >{{ stage.error }}</span>
            </div>
          </div>

          <!-- 识别结果 -->
          <template v-if="detail.snap.finalResult?.contexts?.length">
            <p class="text-xs text-slate-400 mb-2 font-medium">
              识别结果（{{ detail.snap.finalResult.contexts.length }} 个，置信度 {{ Math.round(detail.snap.finalConfidence * 100) }}%）
            </p>
            <ContextTags
              :data="sensingContextsToData(detail.snap.finalResult.contexts)"
              :editable="true"
              class="mb-3"
              @select="onContextTagSelect"
              @apply-all="onContextApplyAll"
            />
          </template>

          <!-- 建议 -->
          <div v-if="detail.snap.finalResult?.suggestions?.length" class="mt-4">
            <p class="text-xs text-slate-400 mb-2 font-medium">建议</p>
            <p
              v-for="s in detail.snap.finalResult.suggestions" :key="s"
              class="text-xs text-slate-600 mb-1"
            >{{ s }}</p>
          </div>

        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, h, reactive } from 'vue'
import { Clipboard, FolderOpen } from '@lucide/vue'
import {
  NDataTable, NButton,
  NDrawer, NDrawerContent, NSpin, NImage, NImageGroup,
  useMessage,
} from 'naive-ui'
import ContextTags from '@/components/ContextTags.vue'
import TabTable from '@/components/TabTable.vue'
import type { DataTableColumns } from 'naive-ui'
import type { SnapshotSummary, SnapshotDetail, SensingContext, ContextDataItem } from '@/types'
import {
  getSensingStatus, getSensingHistory, getSensingSnapshot,
  dismissSensing,
  getContext, setContext,
} from '@/api/alfred'
import { formatTime } from '@/utils/search'

const message = useMessage()

// ─── 数据源配置 ────────────────────────────────────────────────────────────────

const SOURCES = [
  { key: 'clipboard', label: '剪贴板', histLabel: '剪贴板历史', icon: Clipboard },
  { key: 'finder',    label: '访达',   histLabel: '访达历史',   icon: FolderOpen },
]

const STAGE_LABELS: Record<string, string> = {
  fast: '快速解析', rule: '规则解析', heuristic: '启发解析', ai: 'AI 解析',
}

// ─── 状态 ──────────────────────────────────────────────────────────────────────

const loading       = ref(false)
const histLoading   = ref(false)
const statuses      = ref<Record<string, SnapshotSummary | null>>({})
const histories     = ref<Record<string, SnapshotSummary[]>>({})
const activeHistTab = ref(SOURCES[0].key)

const detail = reactive<{ show: boolean; loading: boolean; snap: SnapshotDetail | null }>({
  show: false, loading: false, snap: null,
})

// ─── 计算属性 ──────────────────────────────────────────────────────────────────

const anyParsing = computed(() =>
  Object.values(statuses.value).some(s => s?.overallStatus === 'parsing'))

const pollingDotClass = computed(() =>
  anyParsing.value ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400')

const pollingLabel = computed(() =>
  anyParsing.value ? '解析中...' : '就绪')

// ─── 辅助函数 ──────────────────────────────────────────────────────────────────

function statusText(snap: SnapshotSummary | null | undefined): string {
  if (!snap) return '空闲'
  if (snap.overallStatus === 'parsing')
    return snap.currentStage ? (STAGE_LABELS[snap.currentStage] ?? snap.currentStage) + '…' : '解析中…'
  if (snap.overallStatus === 'done') return snap.dismissed ? '已忽略' : '完成'
  return '已中断'
}

function statusBadgeClass(snap: SnapshotSummary | null | undefined): string {
  if (!snap) return 'bg-slate-100 text-slate-400'
  if (snap.overallStatus === 'parsing') return 'bg-amber-100 text-amber-600'
  if (snap.overallStatus === 'done' && !snap.dismissed) return 'bg-emerald-100 text-emerald-600'
  return 'bg-slate-100 text-slate-400'
}

function cardBorderClass(snap: SnapshotSummary | null | undefined): string {
  if (!snap) return 'border-slate-100'
  if (snap.overallStatus === 'parsing') return 'border-amber-200'
  if (snap.overallStatus === 'done' && !snap.dismissed && snap.finalResult?.contexts?.length)
    return 'border-emerald-200'
  return 'border-slate-100'
}

function stageColor(status: string): string {
  return ({ running: 'bg-amber-400', done: 'bg-emerald-400', error: 'bg-red-400', interrupted: 'bg-slate-300' }
  )[status] ?? 'bg-slate-200'
}

function isImageContent(snap: SnapshotDetail | null): boolean {
  if (!snap) return false
  const type    = snap.changeEvent?.contentType ?? ''
  const content = snap.changeEvent?.content ?? snap.contentPreview ?? ''
  return type.startsWith('image') || content.startsWith('data:image/')
}

function sensingContextsToData(contexts: SensingContext[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const ctx of contexts) {
    const v = ctx.value.value
    if (typeof v === 'string') {
      out[ctx.key] = { id: v, name: ctx.value.name || v, value: v }
    } else if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        const str = String(val)
        out[k] = { id: str, name: str, value: str }
      }
    }
  }
  return out
}

async function onContextTagSelect(key: string, item: ContextDataItem) {
  const current = await getContext()
  await setContext({ state: current?.state ?? 'home', data: { ...current?.data, [key]: item } })
  message.success(`已更新上下文「${key}」`)
}

async function onContextApplyAll(data: Record<string, unknown>) {
  const current = await getContext()
  await setContext({
    state: current?.state ?? 'home',
    data: { ...current?.data, ...(data as Record<string, ContextDataItem>) },
  })
  message.success(`已应用 ${Object.keys(data).length} 项到上下文`)
}

// ─── 数据加载 ──────────────────────────────────────────────────────────────────

async function loadStatus() {
  try { statuses.value = await getSensingStatus() } catch { /* 嗅探服务未启动时忽略 */ }
}

async function loadAllHistory() {
  histLoading.value = true
  try {
    const results = await Promise.allSettled(SOURCES.map(s => getSensingHistory(s.key)))
    const map: Record<string, SnapshotSummary[]> = {}
    SOURCES.forEach((s, i) => {
      const r = results[i]
      map[s.key] = r.status === 'fulfilled' ? r.value : []
    })
    histories.value = map
  } finally {
    histLoading.value = false
  }
}

async function doRefresh() {
  loading.value = true
  try { await Promise.all([loadStatus(), loadAllHistory()]) }
  finally { loading.value = false }
}

// ─── 详情 ──────────────────────────────────────────────────────────────────────

async function openDetail(id: string) {
  detail.show = true
  detail.loading = true
  detail.snap = null
  try { detail.snap = await getSensingSnapshot(id) }
  finally { detail.loading = false }
}

async function doDismiss(source: string) {
  await dismissSensing(source)
  if (statuses.value[source]) statuses.value[source]!.dismissed = true
  message.success('已忽略')
}

// ─── 历史表格列定义 ────────────────────────────────────────────────────────────

const histColumns: DataTableColumns<SnapshotSummary> = [
  {
    title: '内容', key: 'contentPreview',
    render: (row) => {
      if (row.contentType?.startsWith('image')) {
        if (row.contentPreview?.startsWith('data:image/')) {
          return h('img', {
            src: row.contentPreview,
            style: 'max-height:64px; max-width:128px; border-radius:4px; object-fit:contain; display:block',
          })
        }
        return h('span', {
          style: 'font-size:11px; padding:1px 6px; border-radius:4px; background:#f0f0ff; color:#6366f1; white-space:nowrap',
        }, '图片')
      }
      return h('span', {
        style: 'font-family:monospace; font-size:12px; color:#6b7280; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; word-break:break-all',
        title: row.contentPreview,
      }, row.contentPreview || '—')
    },
  },
  {
    title: '上下文', key: 'contexts',
    render: (row) => {
      if (!row.finalResult?.contexts?.length) {
        return h('span', { style: 'color:#d1d5db; font-size:12px' }, '—')
      }
      return h(ContextTags, {
        data: sensingContextsToData(row.finalResult.contexts),
        editable: true,
        onSelect: (key: string, item: ContextDataItem) => onContextTagSelect(key, item),
        onApplyAll: (data: Record<string, unknown>) => onContextApplyAll(data),
      })
    },
  },
  {
    title: '状态', key: 'overallStatus', width: 80,
    render: (row) => {
      const isParsing = row.overallStatus === 'parsing'
      const isDone    = row.overallStatus === 'done' && !row.dismissed
      const style = `font-size:11px; padding:1px 6px; border-radius:4px; ${
        isParsing ? 'background:#fef3c7; color:#d97706' :
        isDone    ? 'background:#d1fae5; color:#059669' :
                    'background:#f3f4f6; color:#9ca3af'}`
      return h('span', { style }, statusText(row))
    },
  },
  {
    title: '置信度', key: 'finalConfidence', width: 65,
    render: (row) => h('span', { style: 'color:#9ca3af; font-size:12px' },
      row.finalConfidence ? Math.round(row.finalConfidence * 100) + '%' : '—'),
  },
  {
    title: '时间', key: 'createdAt', width: 110,
    render: (row) => h('span', {
      style: 'color:#9ca3af; font-size:12px',
      title: new Date(row.createdAt).toLocaleString('zh-CN'),
    }, formatTime(row.createdAt)),
  },
  {
    title: '', key: 'actions', width: 55,
    render: (row) => h(NButton, {
      size: 'tiny', ghost: true, onClick: () => openDetail(row.id),
    }, { default: () => '详情' }),
  },
]

// ─── 轮询 ──────────────────────────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setTimeout> | null = null

async function poll() {
  if (document.hidden) return
  await loadStatus()
  pollTimer = setTimeout(poll, anyParsing.value ? 1000 : 3000)
}

function startPolling() {
  if (pollTimer) clearTimeout(pollTimer)
  poll()
}

function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
}

function onVisChange() {
  document.hidden ? stopPolling() : startPolling()
}

onMounted(() => {
  loadAllHistory()
  startPolling()
  document.addEventListener('visibilitychange', onVisChange)
})

onUnmounted(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', onVisChange)
})
</script>

<style scoped>
:deep(.n-drawer-content .n-drawer-content__main) {
  padding: 16px;
}
</style>
