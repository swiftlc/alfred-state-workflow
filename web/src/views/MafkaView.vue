<template>
  <ContextGroup>
  <div class="flex flex-col overflow-hidden" style="height: 100%">

    <!-- ── 标题行 ──────────────────────────────────────────────────────────── -->
    <div class="shrink-0 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-lg font-semibold text-slate-800 tracking-tight">Mafka</h1>
        <div class="flex items-center gap-2">
          <span v-if="subLoading" class="flex items-center gap-1.5 text-xs text-slate-400">
            <n-spin :size="12" />
            加载订阅…
          </span>
          <template v-if="subscription">
            <span class="text-xs text-slate-400">
              {{ subscription.consumerGroups.length }} 消费组
            </span>
            <span class="text-xs text-slate-300">·</span>
            <span class="text-xs text-slate-400">
              {{ subscription.producerInfos.length }} 生产者
            </span>
          </template>
          <button
            v-if="selectedTopic"
            class="mafka-text-btn"
            @click="subDrawerShow = true"
          >订阅详情</button>
          <!-- envTag 切换 -->
          <div class="flex items-center gap-0.5">
            <button
              v-for="env in ENV_TAGS" :key="env"
              class="mafka-env-btn"
              :class="{ 'mafka-env-btn--active': envTag === env }"
              @click="onEnvTagChange(env)"
            >{{ env }}</button>
          </div>
        </div>
      </div>

      <!-- ── chip 行 ──────────────────────────────────────────────────────── -->
      <div class="flex items-center gap-1.5 flex-wrap">

        <!-- appkey -->
        <ContextItem
          context-key="appkey"
          :value="appkeyInput ?? ''"
          label="Appkey"
          :fetch-items="fetchAppkeyItems"
          custom-edit
          @edit="onAppkeyEdit"
        >
          <span class="mafka-chip" :class="appkeyInput ? 'mafka-chip--slate' : 'mafka-chip--empty'">
            <span class="font-mono">{{ appkeyInput || 'Appkey…' }}</span>
          </span>
        </ContextItem>

        <span class="mafka-sep">/</span>

        <!-- Topic -->
        <ContextItem
          v-if="selectedTopic"
          context-key="kafka_topic"
          :value="selectedTopic.taskName"
          :label="selectedTopic.displayName"
          :fetch-items="fetchTopicItems"
          custom-edit
          @edit="onTopicEdit"
        >
          <span class="mafka-chip mafka-chip--indigo">
            <span class="font-mono text-indigo-400 flex-shrink-0">#{{ selectedTopic.topicId }}</span>
            <span class="font-medium truncate max-w-48">{{ selectedTopic.displayName }}</span>
          </span>
        </ContextItem>
        <span
          v-else
          class="mafka-chip mafka-chip--empty mafka-chip--clickable"
          @click="topicPickerShow = true"
        >
          <span>选择 Topic…</span>
        </span>

        <!-- 右侧：泳道 badge -->
        <div class="ml-auto flex items-center gap-2 flex-shrink-0">
          <ContextItem
            v-if="swimlaneInput"
            context-key="swimlane"
            :value="swimlaneInput"
            label="泳道"
          >
            <span class="mafka-swim-badge">
              <span class="mafka-swim-badge__dot" />{{ swimlaneInput }}
            </span>
          </ContextItem>
        </div>
      </div>
    </div>

    <!-- Topic DictPicker（手动触发） -->
    <DictPicker
      v-model:show="topicPickerShow"
      dict-key="kafka_topic"
      dict-name="Kafka Topic"
      :fetch-items="fetchTopicItems"
      :current-value="currentTopicForPicker"
      @select="onTopicEdit"
    />

    <!-- ── 主体：消息流 + 发送区 ────────────────────────────────────────── -->
    <div class="flex-1 min-h-0 flex flex-col">

      <!-- 无选中 -->
      <div v-if="!selectedTopic" class="flex-1 flex flex-col items-center justify-center text-slate-300 select-none">
        <div class="text-5xl mb-3">📨</div>
        <div class="text-sm">选择 Appkey 与 Topic 后开始</div>
      </div>

      <template v-else>
        <!-- 消息流 -->
        <div ref="msgListRef" class="flex-1 min-h-0 overflow-y-auto py-4 flex flex-col gap-2">
          <div v-if="messages.length === 0" class="flex-1 flex items-center justify-center">
            <span class="text-sm text-slate-300">暂无消息 · 点击「拉取」获取最近消息</span>
          </div>

          <template v-for="msg in messages" :key="msg.id">
            <!-- system -->
            <div v-if="msg.type === 'system'" class="flex justify-center">
              <span class="mafka-msg-system">{{ msg.content }}</span>
            </div>

            <!-- received -->
            <div v-else-if="msg.type === 'received'" class="flex justify-start">
              <div class="mafka-bubble mafka-bubble--recv">
                <pre class="mafka-bubble__code">{{ formatJson(msg.content) }}</pre>
                <div class="mafka-bubble__footer mafka-bubble__footer--recv">
                  <span>p{{ msg.partition }} @ {{ msg.offset }}</span>
                  <span>{{ formatTs(msg.timestamp) }}</span>
                </div>
              </div>
            </div>

            <!-- sent -->
            <div v-else class="flex justify-end">
              <div class="mafka-bubble mafka-bubble--sent">
                <pre class="mafka-bubble__code">{{ formatJson(msg.content) }}</pre>
                <div class="mafka-bubble__footer mafka-bubble__footer--sent">
                  <span v-if="msg.swimlane" class="mafka-swimlane-tag">{{ msg.swimlane }}</span>
                  <template v-if="msg.status === 'sending'">
                    <span class="opacity-60">发送中…</span>
                  </template>
                  <template v-else-if="msg.status === 'error'">
                    <span class="text-red-300">{{ msg.error }}</span>
                  </template>
                  <template v-else>
                    <span>{{ formatTs(msg.timestamp) }}</span>
                    <span class="opacity-60">✓</span>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- 发送区 -->
        <div class="mafka-compose shrink-0">
          <!-- 工具栏 -->
          <div class="mafka-compose__toolbar">
            <!-- 发送目标：主干 / 泳道 -->
            <div class="flex items-center gap-0.5 flex-shrink-0">
              <button
                class="mafka-env-btn"
                :class="{ 'mafka-env-btn--active': sendToTrunk }"
                @click="sendToTrunk = true"
              >主干</button>
              <button
                class="mafka-env-btn"
                :class="{ 'mafka-env-btn--active': !sendToTrunk }"
                @click="sendToTrunk = false"
              >泳道</button>
            </div>

            <!-- 泳道 DictPicker -->
            <ContextItem
              v-if="!sendToTrunk"
              context-key="swimlane"
              :value="swimlaneInput"
              label="泳道"
              :fetch-items="fetchSwimlaneItems"
              custom-edit
              bare
              @edit="(item) => swimlaneInput = item.value ?? ''"
            >
              <span
                class="mafka-chip flex-shrink-0"
                :class="swimlaneInput ? 'mafka-chip--indigo' : 'mafka-chip--empty mafka-chip--clickable'"
              >{{ swimlaneInput || '选择泳道…' }}</span>
            </ContextItem>

            <span class="flex-1" />

            <!-- 时间选择 -->
            <n-date-picker
              v-model:value="pullDateTs"
              type="datetime"
              clearable
              :placeholder="'留空=当前'"
              size="small"
              style="width:180px"
            />
            <!-- 条数 -->
            <span class="mafka-compose__label">条数</span>
            <input
              v-model.number="pullLimit"
              class="mafka-inline-input w-10 text-center"
              type="number"
              min="1"
              max="100"
            />
            <n-button size="tiny" ghost :loading="pulling" :disabled="pulling" @click="doPull">
              查询
            </n-button>
            <span class="w-px h-3 bg-slate-200 mx-1 flex-shrink-0" />
            <n-button
              size="tiny"
              type="primary"
              :loading="sending"
              :disabled="!composeText.trim() || sending"
              @click="doSend"
            >
              发送{{ sendToTrunk ? '' : '·泳道' }}
            </n-button>
          </div>

          <!-- 文本域 -->
          <n-input
            v-model:value="composeText"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 10 }"
            placeholder='{"key": "value"}'
            class="mafka-compose__textarea font-mono text-xs"
            @keydown.meta.enter.prevent="doSend"
            @keydown.ctrl.enter.prevent="doSend"
          />

          <!-- 底部辅助行 -->
          <div class="flex items-center gap-2 px-1 pt-1.5 pb-0.5">
            <button class="mafka-text-btn" @click="composeText = '{}'">清空</button>
            <button class="mafka-text-btn" @click="formatCompose">格式化</button>
          </div>
        </div>
      </template>
    </div>

  </div>
  </ContextGroup>

  <!-- ── 订阅详情抽屉 ──────────────────────────────────────────────────── -->
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
        <!-- 基本信息 -->
        <div class="sub-section">
          <div class="sub-section__title">基本信息</div>
          <div class="sub-row"><span>TopicId</span><code>{{ selectedTopic?.topicId }}</code></div>
          <div class="sub-row"><span>TaskName</span><code class="break-all">{{ selectedTopic?.taskName }}</code></div>
          <div class="sub-row"><span>环境</span><span>{{ envTag }}</span></div>
        </div>
        <!-- 生产者 -->
        <div class="sub-section">
          <div class="sub-section__title">生产者 ({{ subscription.producerInfos.length }})</div>
          <div v-for="p in subscription.producerInfos" :key="p.appkey" class="sub-row">
            <code>{{ p.appkey }}</code>
          </div>
          <div v-if="!subscription.producerInfos.length" class="sub-empty">暂无</div>
        </div>
        <!-- 消费组（优先用 consumers 详情，fallback subscription） -->
        <div class="sub-section">
          <div class="sub-section__title">
            消费组 ({{ consumers.length || subscription.consumerGroups.length }})
          </div>
          <template v-if="consumers.length">
            <div
              v-for="c in consumers"
              :key="c.id"
              class="sub-group-card"
            >
              <div class="flex items-center justify-between">
                <div class="font-medium text-slate-700 text-[12.5px] truncate flex-1">{{ c.name }}</div>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ml-2"
                  :class="c.status === 1 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'"
                >{{ c.status === 1 ? '正常' : '停用' }}</span>
              </div>
              <div class="text-[11.5px] text-slate-500 font-mono mt-0.5">{{ c.appkey }}</div>
              <div class="flex items-center gap-2 mt-0.5 text-[10.5px] text-slate-400">
                <span>{{ c.environment }}</span>
                <span>{{ c.addTime }}</span>
              </div>
              <div v-if="c.remark" class="text-[11px] text-slate-400 mt-0.5 italic">{{ c.remark }}</div>
            </div>
          </template>
          <template v-else>
            <div
              v-for="g in subscription.consumerGroups"
              :key="g.groupName"
              class="sub-group-card"
            >
              <div class="font-medium text-slate-700 text-[12.5px]">{{ g.groupName }}</div>
              <div class="text-[11.5px] text-slate-500 font-mono">{{ g.appkey }}</div>
              <div v-if="g.remark" class="text-[11px] text-slate-400 mt-0.5">{{ g.remark }}</div>
            </div>
          </template>
          <div v-if="!consumers.length && !subscription.consumerGroups.length" class="sub-empty">暂无</div>
        </div>
      </template>
      <div v-else class="py-10 text-center text-sm text-slate-400">暂无订阅信息</div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { NButton, NSpin, NInput, NDrawer, NDrawerContent, NDatePicker, useMessage } from 'naive-ui'
import { makeFetchItems } from '@/utils/dict'
import ContextItem from '@/components/ContextItem.vue'
import ContextGroup from '@/components/ContextGroup.vue'
import DictPicker from '@/components/DictPicker.vue'
import type { ContextDataItem } from '@/types'
import { fetchTopicSubscriptions, sendMafkaMessage, queryMafkaMessages, fetchConsumersByTopicId } from '@/api/mafka'
import type { MafkaSubscription, MafkaConsumer, EnvTag } from '@/api/mafka'

defineOptions({ name: 'MafkaView' })

// ── Types ─────────────────────────────────────────────────────────────────

interface SelectedTopic {
  topicId:     number
  taskName:    string
  displayName: string
}

type MsgType = 'sent' | 'received' | 'system'

interface ChatMsg {
  id:         string
  type:       MsgType
  content:    string
  timestamp:  number
  partition?: number
  offset?:    number
  swimlane?:  string
  status?:    'sending' | 'success' | 'error'
  error?:     string
}

// ── Constants ─────────────────────────────────────────────────────────────

const ENV_TAGS: EnvTag[] = ['test', 'staging', 'prod']
const LS_KEY = 'mafka_view'

// ── State ─────────────────────────────────────────────────────────────────

const message       = useMessage()
const envTag        = ref<EnvTag>('test')
const appkeyInput   = ref<string | null>(null)
const selectedTopic = ref<SelectedTopic | null>(null)
const swimlaneInput = ref('')

const subscription  = ref<MafkaSubscription | null>(null)
const consumers     = ref<MafkaConsumer[]>([])
const subLoading    = ref(false)
const subDrawerShow = ref(false)

const messages      = ref<ChatMsg[]>([])
const composeText   = ref('{}')
const pullPartition = ref(0)
const pullLimit     = ref(10)
const pullDateTs    = ref<number | null>(null)  // timestamp，null=当前时间
const sendToTrunk   = ref(true) // true=主干默认，false=指定泳道
const sending       = ref(false)
const pulling       = ref(false)

const msgListRef    = ref<HTMLElement | null>(null)
const topicPickerShow = ref(false)

// ── Dict fetch fns (复用全局字典) ─────────────────────────────────────────

const fetchAppkeyItems  = makeFetchItems('appkey')
const fetchTopicItems   = makeFetchItems('kafka_topic')
const fetchSwimlaneItems = makeFetchItems('swimlane')

// ── Computed ──────────────────────────────────────────────────────────────

const currentTopicForPicker = computed<ContextDataItem | null>(() => {
  const t = selectedTopic.value
  if (!t) return null
  return { id: String(t.topicId), name: t.displayName, value: t.taskName }
})

// ── Handlers ─────────────────────────────────────────────────────────────

function onAppkeyEdit(item: ContextDataItem) {
  appkeyInput.value = item.value ?? null
  saveLs()
}

function onTopicEdit(item: ContextDataItem) {
  // kafka_topic dict: id=topicId, value=taskName, name=displayName
  selectedTopic.value = {
    topicId:     parseInt(item.id),
    taskName:    item.value,
    displayName: item.name,
  }
  messages.value     = []
  subscription.value = null
  saveLs()
  loadSubscription()
}

function onEnvTagChange(env: EnvTag) {
  envTag.value        = env
  selectedTopic.value = null
  messages.value      = []
  subscription.value  = null
  // 清除 topic 缓存让下次重新拉取
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

// ── Pull / Send ───────────────────────────────────────────────────────────

async function doPull() {
  const t = selectedTopic.value
  if (!t) return
  pulling.value = true
  try {
    // timestamp → 'YYYY-MM-DD HH:mm:ss'
    const dt = pullDateTs.value
      ? new Date(pullDateTs.value).toLocaleString('sv-SE').replace('T', ' ')
      : undefined
    const msgs = await queryMafkaMessages({
      topicId:  t.topicId,
      dateTime: dt,
      limit:    pullLimit.value,
    })
    if (!msgs.length) {
      pushSystem('未查询到消息')
      return
    }
    for (const m of msgs) {
      messages.value.push({
        id:        `recv-${m.partition}-${m.offset}-${Date.now()}`,
        type:      'received',
        content:   m.value,
        timestamp: m.timestamp,
        partition: m.partition,
        offset:    m.offset,
      })
    }
    const dtLabel = pullDateTs.value ? new Date(pullDateTs.value).toLocaleString('zh-CN') : '当前时间'
    pushSystem(`已查询 ${msgs.length} 条 · ${dtLabel}`)
    scrollBottom()
  } catch (e: any) {
    message.error(`查询失败: ${e?.message ?? e}`)
  } finally {
    pulling.value = false
  }
}

async function doSend() {
  const t = selectedTopic.value
  if (!t || !composeText.value.trim() || sending.value) return

  const msgId = `sent-${Date.now()}`
  messages.value.push({
    id:       msgId,
    type:     'sent',
    content:  composeText.value.trim(),
    timestamp: Date.now(),
    swimlane: swimlaneInput.value || undefined,
    status:   'sending',
  })
  scrollBottom()
  sending.value = true

  try {
    const res = await sendMafkaMessage({
      topicId:  t.topicId,
      taskName: t.taskName,
      appkey:   appkeyInput.value ?? '',
      message:  composeText.value.trim(),
      swimlane: sendToTrunk.value ? undefined : (swimlaneInput.value || undefined),
    })
    const idx = messages.value.findIndex(m => m.id === msgId)
    if (idx !== -1) {
      messages.value[idx] = {
        ...messages.value[idx],
        status: res.success ? 'success' : 'error',
        error:  res.success ? undefined : res.msg,
      }
    }
    if (!res.success) message.error(`发送失败: ${res.msg}`)
  } catch (e: any) {
    const idx = messages.value.findIndex(m => m.id === msgId)
    if (idx !== -1) messages.value[idx] = { ...messages.value[idx], status: 'error', error: String(e?.message ?? e) }
    message.error(`发送失败: ${e?.message ?? e}`)
  } finally {
    sending.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function pushSystem(content: string) {
  messages.value.push({ id: `sys-${Date.now()}`, type: 'system', content, timestamp: Date.now() })
}

function scrollBottom() {
  nextTick(() => { if (msgListRef.value) msgListRef.value.scrollTop = msgListRef.value.scrollHeight })
}

function formatJson(v: string) {
  try { return JSON.stringify(JSON.parse(v), null, 2) } catch { return v }
}

function formatTs(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatCompose() {
  try { composeText.value = JSON.stringify(JSON.parse(composeText.value), null, 2) }
  catch { message.warning('JSON 格式不合法') }
}

// ── Persistence ───────────────────────────────────────────────────────────

function saveLs() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      appkey: appkeyInput.value,
      topic:  selectedTopic.value,
      envTag: envTag.value,
    }))
  } catch { /* ignore */ }
}

function restoreLs() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const { appkey, topic, envTag: env } = JSON.parse(raw)
    if (appkey) appkeyInput.value = appkey
    if (topic)  selectedTopic.value = topic
    if (env)    envTag.value = env
  } catch { /* ignore */ }
}

// ── Init ──────────────────────────────────────────────────────────────────

onMounted(async () => {
  restoreLs()
  if (selectedTopic.value) loadSubscription()
})
</script>

<style scoped>
/* ── 复用 octo-chip 体系 ──────────────────────────────────────────────── */
.mafka-chip {
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
.mafka-chip--slate {
  background: #f1f5f9; border-color: #e2e8f0; color: #475569;
}
.mafka-chip--slate:hover { background: #e8ecf2; border-color: #c8d0db; }

.mafka-chip--indigo {
  background: #eef2ff; border-color: #c7d2fe; color: #4338ca;
}
.mafka-chip--indigo:hover { background: #e0e7ff; border-color: #a5b4fc; }

.mafka-chip--empty {
  background: transparent;
  border-style: dashed;
  border-color: #cbd5e1;
  color: #94a3b8;
  cursor: default;
}
.mafka-chip--empty.mafka-chip--clickable {
  cursor: pointer;
}
.mafka-chip--empty.mafka-chip--clickable:hover {
  border-color: #818cf8; color: #6366f1; background: #f5f3ff;
}

.mafka-sep {
  color: #cbd5e1; font-size: 11px; padding: 0 1px; flex-shrink: 0;
}

/* 泳道 badge（与 octo-swim-badge 同款） */
.mafka-swim-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 1px 8px 1px 5px;
  border-radius: 10px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #4338ca;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
  white-space: nowrap;
}
.mafka-swim-badge:hover { background: #e0e7ff; border-color: #a5b4fc; }
.mafka-swim-badge__dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #818cf8; flex-shrink: 0;
}

/* ── 消息气泡 ──────────────────────────────────────────────────────────── */
.mafka-bubble {
  max-width: 76%;
  border-radius: 12px;
  overflow: hidden;
}
.mafka-bubble--recv {
  background: #f8fafc;
  border: 1px solid #e8ecf4;
  border-bottom-left-radius: 4px;
}
.mafka-bubble--sent {
  background: #4f46e5;
  border-bottom-right-radius: 4px;
}

.mafka-bubble__code {
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  padding: 10px 12px 4px;
  max-height: 260px;
  overflow-y: auto;
}
.mafka-bubble--recv .mafka-bubble__code { color: #334155; }
.mafka-bubble--sent .mafka-bubble__code { color: #e0e7ff; }

.mafka-bubble__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 12px 8px;
  font-size: 10.5px;
}
.mafka-bubble__footer--recv { color: #94a3b8; }
.mafka-bubble__footer--sent { color: rgba(199,210,254,0.7); }

.mafka-swimlane-tag {
  font-size: 10px;
  background: rgba(255,255,255,0.18);
  padding: 0 5px;
  border-radius: 4px;
  color: #c7d2fe;
}

.mafka-msg-system {
  font-size: 11px;
  color: #94a3b8;
  background: #f8fafc;
  border-radius: 12px;
  padding: 3px 12px;
}

/* ── 发送区 ──────────────────────────────────────────────────────────── */
.mafka-compose {
  border-top: 1px solid #f1f5f9;
  padding: 10px 0 4px;
}

.mafka-compose__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.mafka-compose__label {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
}

.mafka-inline-input {
  height: 24px;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  padding: 0 7px;
  font-size: 11.5px;
  color: #374151;
  outline: none;
  transition: border-color 0.15s;
}
.mafka-inline-input:focus { border-color: #5b6af0; box-shadow: 0 0 0 2px rgba(91,106,240,.1); }

.mafka-compose__textarea :deep(textarea) {
  font-family: 'Menlo', 'Monaco', monospace !important;
}

/* ── 辅助按钮 ─────────────────────────────────────────────────────────── */
.mafka-text-btn {
  font-size: 11.5px;
  color: #94a3b8;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.1s;
}
.mafka-text-btn:hover { color: #5b6af0; }

.mafka-env-btn {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 5px;
  border: 1px solid #e2e8f0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.1s;
}
.mafka-env-btn:hover { background: #f8fafc; color: #475569; }
.mafka-env-btn--active { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }

/* ── 订阅抽屉 ─────────────────────────────────────────────────────────── */
.sub-section { margin-bottom: 20px; }
.sub-section__title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  margin-bottom: 8px;
}
.sub-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12.5px;
  padding: 4px 0;
  border-bottom: 1px solid #f8fafc;
  color: #374151;
}
.sub-row span:first-child { color: #94a3b8; min-width: 70px; flex-shrink: 0; }
.sub-row code { font-family: monospace; font-size: 12px; color: #334155; }
.sub-group-card {
  background: #f8fafc;
  border: 1px solid #e8ecf4;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 6px;
}
.sub-empty { font-size: 12px; color: #94a3b8; padding: 6px 0; }
</style>
