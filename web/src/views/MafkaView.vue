<template>
  <ContextGroup>
  <div class="flex flex-col overflow-hidden" style="height:100%">

    <!-- ── 标题行 ── -->
    <div class="shrink-0 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-lg font-semibold text-slate-800 tracking-tight">Mafka</h1>
        <div class="flex items-center gap-2">
          <span v-if="subLoading" class="flex items-center gap-1.5 text-xs text-slate-400">
            <n-spin :size="12" />加载订阅…
          </span>
          <template v-if="subscription">
            <span class="text-xs text-slate-400">{{ subscription.consumerGroups.length }} 消费组</span>
            <span class="text-xs text-slate-300">·</span>
            <span class="text-xs text-slate-400">{{ subscription.producerInfos.length }} 生产者</span>
          </template>
          <n-button v-if="selectedTopic" size="tiny" ghost @click="subDrawerShow = true">订阅详情</n-button>
          <div class="flex items-center gap-0.5">
            <button
              v-for="env in ENV_TAGS" :key="env"
              class="mafka-env-btn" :class="{ 'mafka-env-btn--active': envTag === env }"
              @click="onEnvTagChange(env)"
            >{{ env }}</button>
          </div>
        </div>
      </div>

      <!-- chip 行 -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <ContextItem context-key="appkey" :value="appkeyInput ?? ''" label="Appkey"
          :fetch-items="fetchAppkeyItems" custom-edit @edit="onAppkeyEdit">
          <span class="mafka-chip" :class="appkeyInput ? 'mafka-chip--slate' : 'mafka-chip--empty'">
            <span class="font-mono">{{ appkeyInput || 'Appkey…' }}</span>
          </span>
        </ContextItem>
        <span class="mafka-sep">/</span>
        <ContextItem v-if="selectedTopic" context-key="kafka_topic" :value="selectedTopic.taskName"
          :label="selectedTopic.displayName" :fetch-items="fetchTopicItems" custom-edit @edit="onTopicEdit">
          <span class="mafka-chip mafka-chip--indigo">
            <span class="font-mono text-indigo-400 flex-shrink-0">#{{ selectedTopic.topicId }}</span>
            <span class="font-medium truncate max-w-48">{{ selectedTopic.displayName }}</span>
          </span>
        </ContextItem>
        <span v-else class="mafka-chip mafka-chip--empty mafka-chip--clickable" @click="topicPickerShow = true">
          选择 Topic…
        </span>
        <div class="ml-auto flex items-center gap-2 flex-shrink-0">
          <ContextItem v-if="swimlaneInput" context-key="swimlane" :value="swimlaneInput" label="泳道">
            <span class="mafka-swim-badge"><span class="mafka-swim-badge__dot" />{{ swimlaneInput }}</span>
          </ContextItem>
        </div>
      </div>
    </div>

    <!-- Topic DictPicker -->
    <DictPicker v-model:show="topicPickerShow" dict-key="kafka_topic" dict-name="Kafka Topic"
      :fetch-items="fetchTopicItems" :current-value="currentTopicForPicker" @select="onTopicEdit" />

    <!-- 无 topic 选中 -->
    <div v-if="!selectedTopic" class="flex-1 flex flex-col items-center justify-center text-slate-300 select-none">
      <div class="text-5xl mb-3">📨</div>
      <div class="text-sm">选择 Appkey 与 Topic 后开始</div>
    </div>

    <!-- 主体：内部 Tab -->
    <n-tabs
      v-else
      v-model:value="activeTab"
      type="line"
      size="small"
      class="flex-1 min-h-0 flex flex-col mafka-tabs"
      :tab-style="{ paddingLeft: '4px', paddingRight: '4px' }"
    >
      <!-- ══ Tab: 查询 ══ -->
      <n-tab-pane name="query" tab="查询消息" display-directive="show" class="flex-1 min-h-0 flex flex-col pt-3">
        <!-- 查询条件栏 -->
        <div class="flex items-center gap-2 mb-3 shrink-0">
          <n-date-picker
            v-model:value="pullDateTs"
            type="datetime"
            clearable
            placeholder="留空=当前时间"
            size="small"
            style="width:200px"
          />
          <span class="text-[11px] text-slate-400 flex-shrink-0">条数</span>
          <input
            v-model.number="pullLimit"
            class="mafka-inline-input w-14 text-center"
            type="number" min="1" max="100"
          />
          <n-button size="small" :loading="pulling" :disabled="pulling" @click="doPull">查询</n-button>
          <span v-if="queryResult.length" class="text-xs text-slate-400 ml-1">共 {{ queryResult.length }} 条</span>
        </div>

        <!-- 过滤栏（有结果后显示） -->
        <div v-if="queryResult.length" class="flex items-center gap-2 mb-3 shrink-0 flex-wrap">
          <n-input
            v-model:value="filterKeyword"
            size="small"
            placeholder="搜索消息内容…"
            clearable
            style="width:220px"
          />
          <!-- 泳道 chips -->
          <div v-if="resultSwimlanes.length" class="flex items-center gap-1 flex-wrap">
            <span class="text-[11px] text-slate-400">泳道：</span>
            <button
              v-for="sl in resultSwimlanes" :key="sl"
              class="mafka-sl-chip" :class="{ 'mafka-sl-chip--active': filterSwimlane === sl }"
              @click="filterSwimlane = filterSwimlane === sl ? '' : sl"
            >{{ sl }}</button>
          </div>
          <span v-if="filteredResult.length !== queryResult.length" class="text-xs text-slate-400 ml-auto">
            {{ filteredResult.length }} / {{ queryResult.length }}
          </span>
        </div>

        <!-- 消息表格：固定表头，内容滚动 -->
        <div v-if="!queryResult.length && !pulling" class="flex-1 flex items-center justify-center">
          <span class="text-sm text-slate-300">点击「查询」获取最近消息</span>
        </div>
        <n-data-table
          v-else
          :columns="msgColumns"
          :data="filteredResult"
          :loading="pulling"
          :bordered="false"
          :single-line="false"
          size="small"
          flex-height
          class="flex-1"
          :row-key="(row: MafkaMessage) => `${row.partition}-${row.offset}`"
          :expanded-row-keys="expandedKeys"
          :on-update:expanded-row-keys="onExpandChange"
          :render-expand="renderExpand"
        />
      </n-tab-pane>

      <!-- ══ Tab: 发送 ══ -->
      <n-tab-pane name="send" tab="发送消息" display-directive="show" class="flex-1 min-h-0 flex flex-col pt-3">
        <div class="flex-1 min-h-0 flex flex-col gap-3">
          <!-- 发送目标：DictPicker 选泳道（含主干选项） -->
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-[11px] text-slate-400 flex-shrink-0">发送到</span>
            <DictPicker
              :show="swimlanePickerShow"
              dict-key="mafka-swimlane"
              dict-name="泳道"
              placeholder="搜索泳道…"
              :items="swimlanePickerItems"
              :current-value="currentSwimlaneForPicker"
              :allow-input="false"
              @update:show="swimlanePickerShow = $event"
              @select="onSwimlaneSelect"
            />
            <span
              class="mafka-chip cursor-pointer flex-shrink-0"
              :class="swimlaneInput ? 'mafka-chip--indigo' : 'mafka-chip--slate'"
              @click="swimlanePickerShow = true"
            >
              {{ swimlaneInput || '主干（不指定泳道）' }}
            </span>
          </div>

          <!-- Monaco 编辑器 -->
          <div class="flex-1 min-h-0 border border-slate-200 rounded-xl overflow-hidden">
            <LcMonacoEditor v-model="composeText" language="json" height="100%" />
          </div>

          <!-- 底部操作栏 -->
          <div class="flex items-center gap-2 shrink-0">
            <button class="mafka-text-btn" @click="composeText = '{}'">清空</button>
            <button class="mafka-text-btn" @click="formatCompose">格式化</button>
            <span class="flex-1" />
            <n-button
              type="primary"
              size="small"
              :loading="sending"
              :disabled="!composeText.trim() || sending"
              @click="doSend"
            >发送{{ swimlaneInput ? ` · ${swimlaneInput}` : '' }}</n-button>
          </div>

          <!-- 发送历史 -->
          <div v-if="sendHistory.length" class="shrink-0 space-y-1 max-h-36 overflow-y-auto border-t border-slate-100 pt-2">
            <div
              v-for="h in sendHistory" :key="h.id"
              class="flex items-center gap-2 text-xs px-2 py-1 rounded-lg"
              :class="h.status === 'success' ? 'bg-emerald-50' : h.status === 'error' ? 'bg-red-50' : 'bg-slate-50'"
            >
              <span :class="h.status === 'success' ? 'text-emerald-600' : h.status === 'error' ? 'text-red-500' : 'text-slate-400'">
                {{ h.status === 'success' ? '✓' : h.status === 'error' ? '✗' : '…' }}
              </span>
              <span class="text-slate-400 flex-shrink-0">{{ formatTs(h.timestamp) }}</span>
              <span v-if="h.swimlane" class="mafka-sl-tag flex-shrink-0">{{ h.swimlane }}</span>
              <span class="font-mono text-slate-500 truncate flex-1">{{ msgPreview(h.content) }}</span>
              <span v-if="h.error" class="text-red-400 truncate max-w-32" :title="h.error">{{ h.error }}</span>
            </div>
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>

  </div>
  </ContextGroup>

  <!-- ── 订阅详情抽屉 ── -->
  <n-drawer v-model:show="subDrawerShow" :width="440">
    <n-drawer-content :native-scrollbar="false" closable>
      <template #header>
        <div class="flex flex-col gap-0.5">
          <span class="font-semibold">{{ selectedTopic?.displayName }}</span>
          <span class="font-mono text-[11px] text-slate-400">{{ selectedTopic?.taskName }}</span>
        </div>
      </template>
      <div v-if="subLoading" class="py-10 flex justify-center"><n-spin /></div>
      <template v-else-if="subscription">
        <div class="sub-section">
          <div class="sub-section__title">基本信息</div>
          <div class="sub-row"><span>TopicId</span><code>{{ selectedTopic?.topicId }}</code></div>
          <div class="sub-row"><span>TaskName</span><code class="break-all">{{ selectedTopic?.taskName }}</code></div>
          <div class="sub-row"><span>环境</span><span>{{ envTag }}</span></div>
        </div>
        <div class="sub-section">
          <div class="sub-section__title">生产者 ({{ subscription.producerInfos.length }})</div>
          <div v-for="p in subscription.producerInfos" :key="p.appkey" class="sub-row">
            <code>{{ p.appkey }}</code>
          </div>
          <div v-if="!subscription.producerInfos.length" class="sub-empty">暂无</div>
        </div>
        <div class="sub-section">
          <div class="sub-section__title">消费组 ({{ consumers.length || subscription.consumerGroups.length }})</div>
          <template v-if="consumers.length">
            <div v-for="c in consumers" :key="c.id" class="sub-group-card">
              <div class="flex items-center justify-between">
                <div class="font-medium text-slate-700 text-[12.5px] truncate flex-1">{{ c.name }}</div>
                <span class="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ml-2"
                  :class="c.status === 1 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'">
                  {{ c.status === 1 ? '正常' : '停用' }}
                </span>
              </div>
              <div class="text-[11.5px] text-slate-500 font-mono mt-0.5">{{ c.appkey }}</div>
              <div class="flex items-center gap-2 mt-0.5 text-[10.5px] text-slate-400">
                <span>{{ c.environment }}</span><span>{{ c.addTime }}</span>
              </div>
              <div v-if="c.remark" class="text-[11px] text-slate-400 mt-0.5 italic">{{ c.remark }}</div>
            </div>
          </template>
          <template v-else>
            <div v-for="g in subscription.consumerGroups" :key="g.groupName" class="sub-group-card">
              <div class="font-medium text-slate-700 text-[12.5px]">{{ g.groupName }}</div>
              <div class="text-[11.5px] text-slate-500 font-mono">{{ g.appkey }}</div>
              <div v-if="g.remark" class="text-[11px] text-slate-400 mt-0.5">{{ g.remark }}</div>
            </div>
          </template>
          <div v-if="!consumers.length && !subscription.consumerGroups.length" class="sub-empty">暂无</div>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { NButton, NSpin, NInput, NDrawer, NDrawerContent, NDatePicker, NDataTable, NTabs, NTabPane, useMessage } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { makeFetchItems } from '@/utils/dict'
import ContextItem from '@/components/ContextItem.vue'
import ContextGroup from '@/components/ContextGroup.vue'
import DictPicker from '@/components/DictPicker.vue'
import LcMonacoEditor from '@/components/lowcode/LcMonacoEditor.vue'
import type { ContextDataItem } from '@/types'
import { fetchTopicSubscriptions, sendMafkaMessage, queryMafkaMessages, fetchConsumersByTopicId } from '@/api/mafka'
import type { MafkaSubscription, MafkaConsumer, MafkaMessage, EnvTag } from '@/api/mafka'

defineOptions({ name: 'MafkaView' })

// ── Types ─────────────────────────────────────────────────────────────────

interface SelectedTopic {
  topicId:     number
  taskName:    string
  displayName: string
}

interface SendRecord {
  id:        string
  content:   string
  timestamp: number
  swimlane?: string
  status:    'sending' | 'success' | 'error'
  error?:    string
}

// ── Constants ─────────────────────────────────────────────────────────────

const ENV_TAGS: EnvTag[] = ['test', 'staging', 'prod']
const LS_KEY = 'mafka_view'

// ── State ─────────────────────────────────────────────────────────────────

const msg           = useMessage()
const envTag        = ref<EnvTag>('test')
const appkeyInput   = ref<string | null>(null)
const selectedTopic = ref<SelectedTopic | null>(null)
const swimlaneInput = ref('')

const subscription  = ref<MafkaSubscription | null>(null)
const consumers     = ref<MafkaConsumer[]>([])
const subLoading    = ref(false)
const subDrawerShow = ref(false)

const activeTab     = ref<'query' | 'send'>('query')

// 查询 tab
const pulling       = ref(false)
const pullDateTs    = ref<number | null>(null)
const pullLimit     = ref(10)
const queryResult   = ref<MafkaMessage[]>([])
const filterKeyword  = ref('')
const filterSwimlane = ref('')
const expandedKeys   = ref<Array<string | number>>([])

function onExpandChange(keys: Array<string | number>) {
  expandedKeys.value = keys
}

// 发送 tab
const sending             = ref(false)
const composeText         = ref('{}')
const sendHistory         = ref<SendRecord[]>([])
const swimlanePickerShow  = ref(false)

const topicPickerShow = ref(false)

// ── Dict fetch fns ────────────────────────────────────────────────────────

const fetchAppkeyItems = makeFetchItems('appkey')
const fetchTopicItems  = makeFetchItems('kafka_topic')

// ── Computed ──────────────────────────────────────────────────────────────

// 泳道 DictPicker items：「主干」固定在首位，后跟从字典加载的泳道
import type { DictItem } from '@/types'
const TRUNK_ITEM: DictItem = { id: '__trunk__', name: '主干（不指定泳道）', value: '', description: '发送到默认主干', pinned: false, lastUsedAt: 0 }

const swimlanePickerItems = computed((): DictItem[] => {
  // 从 resultSwimlanes（查询结果里已有的泳道）补充到 picker
  const fromResults = resultSwimlanes.value.map(sl => ({
    id: sl, name: sl, value: sl, description: '', pinned: false, lastUsedAt: 0,
  }))
  return [TRUNK_ITEM, ...fromResults]
})

const currentSwimlaneForPicker = computed<ContextDataItem | null>(() => {
  if (!swimlaneInput.value) return { id: '__trunk__', name: '主干（不指定泳道）', value: '' }
  return { id: swimlaneInput.value, name: swimlaneInput.value, value: swimlaneInput.value }
})

function onSwimlaneSelect(item: ContextDataItem) {
  swimlaneInput.value = item.value ?? ''
}

const currentTopicForPicker = computed<ContextDataItem | null>(() => {
  const t = selectedTopic.value
  if (!t) return null
  return { id: String(t.topicId), name: t.displayName, value: t.taskName }
})

/** tag 字段直接是泳道标签字符串 */
function getMsgTag(m: MafkaMessage): string {
  return m.tag ?? ''
}

/** 从查询结果里提取唯一泳道列表（来自 tag 字段） */
const resultSwimlanes = computed<string[]>(() => {
  const set = new Set<string>()
  queryResult.value.forEach(m => { if (m.tag) set.add(m.tag) })
  return Array.from(set).sort()
})

/** 过滤后的消息列表 */
const filteredResult = computed<MafkaMessage[]>(() => {
  let list = queryResult.value
  if (filterKeyword.value.trim()) {
    const kw = filterKeyword.value.toLowerCase()
    list = list.filter(m => m.value.toLowerCase().includes(kw))
  }
  if (filterSwimlane.value) {
    list = list.filter(m => m.tag === filterSwimlane.value)
  }
  return list
})

/** 表格列定义 */
const msgColumns: DataTableColumns<MafkaMessage> = [
  {
    title: '时间',
    key: 'timestamp',
    width: 86,
    render: (row) => h('span', { style: 'font-size:11px;color:#94a3b8;white-space:nowrap' }, formatTs(row.timestamp)),
  },
  {
    title: '泳道',
    key: 'tag',
    width: 140,
    render: (row) => {
      const tag = getMsgTag(row)
      if (!tag) return h('span', { style: 'color:#d1d5db;font-size:11px' }, '—')
      return h('span', {
        style: 'display:inline-flex;align-items:center;font-size:11px;font-weight:600;padding:1px 7px;border-radius:4px;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px',
        title: tag,
      }, tag)
    },
  },
  {
    title: '内容',
    key: 'value',
    render: (row) => h('span', {
      style: 'font-family:Menlo,Monaco,monospace;font-size:11.5px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:100%',
      title: row.value,
    }, msgPreview(row.value)),
  },
  {
    title: 'p/offset',
    key: 'offset',
    width: 90,
    render: (row) => h('span', {
      style: 'font-family:monospace;font-size:10px;color:#94a3b8;white-space:nowrap',
    }, `p${row.partition}@${row.offset}`),
  },
]

/** 展开行：显示格式化 JSON */
function renderExpand(row: MafkaMessage) {
  return h('pre', {
    style: 'font-family:Menlo,Monaco,monospace;font-size:11.5px;color:#334155;line-height:1.6;white-space:pre-wrap;word-break:break-all;margin:0;padding:10px 14px;background:#f8fafc;border-radius:6px;max-height:300px;overflow-y:auto',
  }, formatJson(row.value))
}

// ── Handlers ─────────────────────────────────────────────────────────────

function onAppkeyEdit(item: ContextDataItem) {
  appkeyInput.value = item.value ?? null
  saveLs()
}

function onTopicEdit(item: ContextDataItem) {
  selectedTopic.value = {
    topicId:     parseInt(item.id),
    taskName:    item.value,
    displayName: item.name,
  }
  queryResult.value  = []
  subscription.value = null
  saveLs()
  loadSubscription()
}

function onEnvTagChange(env: EnvTag) {
  envTag.value        = env
  selectedTopic.value = null
  queryResult.value   = []
  subscription.value  = null
  fetchTopicItems.clearCache?.()
  saveLs()
}

// ── Subscription ──────────────────────────────────────────────────────────

async function loadSubscription() {
  const t = selectedTopic.value
  if (!t) return
  subLoading.value = true
  try {
    const [sub, cons] = await Promise.all([
      fetchTopicSubscriptions(t.topicId),
      fetchConsumersByTopicId(t.topicId),
    ])
    subscription.value = sub
    consumers.value    = cons
  } finally {
    subLoading.value = false
  }
}

// ── Query ─────────────────────────────────────────────────────────────────

async function doPull() {
  const t = selectedTopic.value
  if (!t) return
  pulling.value = true
  filterKeyword.value  = ''
  filterSwimlane.value = ''
  expandedKeys.value   = []
  try {
    const dt = pullDateTs.value
      ? new Date(pullDateTs.value).toLocaleString('sv-SE').replace('T', ' ')
      : undefined
    const msgs = await queryMafkaMessages({ topicId: t.topicId, dateTime: dt, limit: pullLimit.value })
    queryResult.value = msgs
    if (!msgs.length) msg.info('未查询到消息')
  } catch (e: unknown) {
    msg.error(`查询失败: ${(e as Error).message}`)
  } finally {
    pulling.value = false
  }
}

// ── Send ──────────────────────────────────────────────────────────────────

async function doSend() {
  const t = selectedTopic.value
  if (!t || !composeText.value.trim() || sending.value) return

  const record: SendRecord = {
    id:        crypto.randomUUID(),
    content:   composeText.value.trim(),
    timestamp: Date.now(),
    swimlane:  swimlaneInput.value || undefined,
    status:    'sending',
  }
  sendHistory.value.unshift(record)
  if (sendHistory.value.length > 20) sendHistory.value.pop()
  sending.value = true

  try {
    const res = await sendMafkaMessage({
      topicId:  t.topicId,
      taskName: t.taskName,
      appkey:   appkeyInput.value ?? '',
      message:  record.content,
      swimlane: record.swimlane,
    })
    const idx = sendHistory.value.findIndex(h => h.id === record.id)
    if (idx !== -1) {
      sendHistory.value[idx] = {
        ...sendHistory.value[idx],
        status: res.success ? 'success' : 'error',
        error:  res.success ? undefined : res.msg,
      }
    }
    if (!res.success) msg.error(`发送失败: ${res.msg}`)
  } catch (e: unknown) {
    const idx = sendHistory.value.findIndex(h => h.id === record.id)
    if (idx !== -1) sendHistory.value[idx] = { ...sendHistory.value[idx], status: 'error', error: String((e as Error).message) }
    msg.error(`发送失败: ${(e as Error).message}`)
  } finally {
    sending.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────


function msgPreview(v: string): string {
  try {
    const s = JSON.stringify(JSON.parse(v))
    return s.length > 120 ? s.slice(0, 120) + '…' : s
  } catch {
    return v.length > 120 ? v.slice(0, 120) + '…' : v
  }
}

function formatJson(v: string) {
  try { return JSON.stringify(JSON.parse(v), null, 2) } catch { return v }
}

function formatTs(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatCompose() {
  try { composeText.value = JSON.stringify(JSON.parse(composeText.value), null, 2) }
  catch { msg.warning('JSON 格式不合法') }
}

// ── Persistence ───────────────────────────────────────────────────────────

function saveLs() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ appkey: appkeyInput.value, topic: selectedTopic.value, envTag: envTag.value })) }
  catch { /* ignore */ }
}

function restoreLs() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const { appkey, topic, envTag: env } = JSON.parse(raw)
    if (appkey) appkeyInput.value   = appkey
    if (topic)  selectedTopic.value = topic
    if (env)    envTag.value        = env
  } catch { /* ignore */ }
}

onMounted(() => {
  restoreLs()
  if (selectedTopic.value) loadSubscription()
})
</script>

<style scoped>
/* ── chip ── */
.mafka-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 6px; font-size: 12px; line-height: 1.6;
  border: 1px solid; transition: background .12s, border-color .12s, color .12s;
  user-select: none; cursor: pointer; white-space: nowrap;
}
.mafka-chip--slate { background:#f1f5f9; border-color:#e2e8f0; color:#475569; }
.mafka-chip--slate:hover { background:#e8ecf2; border-color:#c8d0db; }
.mafka-chip--indigo { background:#eef2ff; border-color:#c7d2fe; color:#4338ca; }
.mafka-chip--indigo:hover { background:#e0e7ff; border-color:#a5b4fc; }
.mafka-chip--empty { background:transparent; border-style:dashed; border-color:#cbd5e1; color:#94a3b8; cursor:default; }
.mafka-chip--empty.mafka-chip--clickable { cursor:pointer; }
.mafka-chip--empty.mafka-chip--clickable:hover { border-color:#818cf8; color:#6366f1; background:#f5f3ff; }

.mafka-sep { color:#cbd5e1; font-size:11px; padding:0 1px; flex-shrink:0; }

/* 泳道 badge */
.mafka-swim-badge {
  display:inline-flex; align-items:center; gap:4px; font-size:11px;
  padding:1px 8px 1px 5px; border-radius:10px; border:1px solid #c7d2fe;
  background:#eef2ff; color:#4338ca; cursor:pointer;
}
.mafka-swim-badge:hover { background:#e0e7ff; }
.mafka-swim-badge__dot { width:5px; height:5px; border-radius:50%; background:#818cf8; flex-shrink:0; }

/* ── 内部 tab ── */

/* ── 泳道 tag ── */
.mafka-sl-tag {
  display:inline-flex; align-items:center;
  font-size:10px; font-weight:600;
  padding:1px 6px; border-radius:4px;
  background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe;
  flex-shrink:0;
}

.mafka-sl-chip {
  font-size:11px; padding:1px 8px; border-radius:8px;
  border:1px solid #e2e8f0; background:#f8fafc; color:#64748b;
  cursor:pointer; user-select:none; transition:all .1s;
}
.mafka-sl-chip:hover { border-color:#a5b4fc; background:#eef2ff; color:#4338ca; }
.mafka-sl-chip--active { background:#eef2ff; border-color:#a5b4fc; color:#4338ca; }

/* ── 辅助 ── */
.mafka-inline-input {
  height:28px; border:1px solid #e2e8f0; border-radius:5px;
  padding:0 7px; font-size:12px; color:#374151; outline:none; transition:border-color .15s;
}
.mafka-inline-input:focus { border-color:#5b6af0; box-shadow:0 0 0 2px rgba(91,106,240,.1); }

.mafka-env-btn {
  font-size:10px; padding:1px 7px; border-radius:5px;
  border:1px solid #e2e8f0; background:transparent; color:#94a3b8; cursor:pointer; transition:all .1s;
}
.mafka-env-btn:hover { background:#f8fafc; color:#475569; }
.mafka-env-btn--active { background:#eef2ff; border-color:#c7d2fe; color:#4338ca; }

.mafka-text-btn {
  font-size:11.5px; color:#94a3b8; background:transparent;
  border:none; cursor:pointer; padding:0; transition:color .1s;
}
.mafka-text-btn:hover { color:#5b6af0; }

/* ── 订阅抽屉 ── */
.sub-section { margin-bottom:20px; }
.sub-section__title {
  font-size:11px; font-weight:700; text-transform:uppercase;
  letter-spacing:.08em; color:#94a3b8; margin-bottom:8px;
}
.sub-row {
  display:flex; align-items:baseline; gap:8px; font-size:12.5px;
  padding:4px 0; border-bottom:1px solid #f8fafc; color:#374151;
}
.sub-row span:first-child { color:#94a3b8; min-width:70px; flex-shrink:0; }
.sub-row code { font-family:monospace; font-size:12px; color:#334155; }
.sub-group-card {
  background:#f8fafc; border:1px solid #e8ecf4;
  border-radius:8px; padding:8px 12px; margin-bottom:6px;
}
.sub-empty { font-size:12px; color:#94a3b8; padding:6px 0; }

/* n-tabs 撑满高度 */
:deep(.mafka-tabs.n-tabs) { display:flex; flex-direction:column; overflow:hidden; }
:deep(.mafka-tabs .n-tabs-pane-wrapper) { flex:1; min-height:0; overflow:hidden; }
:deep(.mafka-tabs .n-tab-pane) { height:100%; display:flex; flex-direction:column; }
</style>
