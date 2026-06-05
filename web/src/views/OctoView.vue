<template>
  <div class="flex flex-col overflow-hidden" style="height: 100%">
    <!-- 标题 + 查询栏 -->
    <div class="shrink-0 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-lg font-semibold text-slate-800 tracking-tight">Octo RPC</h1>
        <span v-if="nodesLoading || methodsLoading" class="flex items-center gap-1.5 text-xs text-slate-400">
          <n-spin :size="12" />
          {{ nodesLoading ? '查询节点…' : '加载方法…' }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <DictSelect
          v-model="appkeyInput"
          dict-key="appkey"
          dict-name="Appkey"
          :fetch-items="fetchAppkeyItems"
          placeholder="com.sankuai.xxx"
          clearable
          style="flex: 1"
        />
        <DictSelect
          v-model="swimlaneInput"
          dict-key="swimlane"
          dict-name="泳道"
          :fetch-items="fetchSwimlaneItems"
          placeholder="泳道（主干）"
          clearable
          style="width: 180px"
        />
        <n-button type="primary" :loading="nodesLoading" :disabled="!appkeyInput" @click="doQueryNodes">
          查询节点
        </n-button>
      </div>

      <!-- 节点信息条 -->
      <div v-if="currentNode" class="flex items-center gap-2 mt-2 flex-wrap">
        <!-- 多节点：可点击切换 -->
        <n-popover
          v-if="allNodes.length > 1"
          trigger="click"
          placement="bottom-start"
          :show-arrow="false"
          style="padding: 4px 0; min-width: 260px"
        >
          <template #trigger>
            <span class="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md border border-emerald-200 text-xs cursor-pointer hover:bg-emerald-100 transition-colors select-none">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <span class="font-mono">{{ currentNode.ip }}:{{ currentNode.port }}</span>
              <span class="text-emerald-500 truncate max-w-36">{{ currentNode.name }}</span>
              <ChevronDown :size="11" class="text-emerald-400 ml-0.5 flex-shrink-0" />
            </span>
          </template>
          <div style="max-height: 240px; overflow-y: auto">
            <div
              v-for="node in allNodes"
              :key="`${node.ip}:${node.port}`"
              class="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors"
              :class="isCurrentNode(node) ? 'bg-indigo-50' : 'hover:bg-slate-50'"
              @click="switchNode(node)"
            >
              <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="isCurrentNode(node) ? 'bg-indigo-400' : 'bg-slate-300'" />
              <span class="font-mono text-xs" :class="isCurrentNode(node) ? 'text-indigo-700 font-medium' : 'text-slate-700'">{{ node.ip }}:{{ node.port }}</span>
              <span class="text-xs text-slate-400 truncate flex-1">{{ node.name }}</span>
              <span v-if="node.swimlane" class="text-[10px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded border border-indigo-100 flex-shrink-0">{{ node.swimlane }}</span>
            </div>
          </div>
        </n-popover>
        <!-- 单节点：静态展示 -->
        <span v-else class="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md border border-emerald-200 text-xs">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          <span class="font-mono">{{ currentNode.ip }}:{{ currentNode.port }}</span>
          <span class="text-emerald-500 truncate max-w-36">{{ currentNode.name }}</span>
        </span>
        <span v-if="currentNode.swimlane" class="bg-indigo-50 text-indigo-600 px-2 py-1 rounded border border-indigo-200 text-xs">
          泳道: {{ currentNode.swimlane }}
        </span>
        <span v-if="currentNode.version" class="text-xs text-slate-400">{{ currentNode.version }}</span>
        <span class="ml-auto text-xs text-slate-400">{{ allNodes.length }} 个节点</span>
      </div>

      <!-- 方法选择触发器 -->
      <div v-if="currentNode" class="mt-2">
        <div
          class="flex items-center gap-2 min-h-[34px] px-3 border rounded-lg cursor-pointer transition-all select-none"
          :class="methodsLoading
            ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
            : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'"
          @click="!methodsLoading && (methodPickerVisible = true)"
        >
          <n-spin v-if="methodsLoading" :size="12" class="flex-shrink-0" />
          <template v-else-if="selectedMethod">
            <span class="text-[13px] text-slate-500 flex-shrink-0">{{ shortName(selectedMethod.serviceName) }}#</span>
            <span class="text-[13px] text-slate-800 font-medium flex-1 truncate">{{ selectedMethod.methodName }}</span>
          </template>
          <span v-else class="text-[13px] text-slate-400 flex-1">
            {{ methodsLoading ? '加载方法中…' : totalMethodCount ? `选择方法… (共 ${totalMethodCount} 个)` : '选择方法…' }}
          </span>
          <ChevronDown :size="14" class="text-slate-400 flex-shrink-0" />
        </div>
      </div>
    </div>

    <!-- 方法选择器 Modal -->
    <n-modal
      v-model:show="methodPickerVisible"
      :mask-closable="true"
      :show-icon="false"
      :auto-focus="false"
      transform-origin="center"
      @after-leave="methodFilter = ''"
    >
      <div class="method-picker-wrap" @keydown.esc="methodPickerVisible = false">
        <div class="method-picker-search">
          <Search :size="18" class="method-picker-search__icon" />
          <input
            ref="methodPickerInputRef"
            v-model="methodFilter"
            class="method-picker-search__input"
            placeholder="搜索服务 / 方法…"
            autocomplete="off"
            spellcheck="false"
            @keydown.enter="confirmMethodByEnter"
            @keydown.up.prevent="moveMethodCursor(-1)"
            @keydown.down.prevent="moveMethodCursor(1)"
            @keydown.esc="methodPickerVisible = false"
          />
          <span class="method-picker-search__count">{{ filteredMethods.length }} / {{ totalMethodCount }}</span>
          <kbd class="method-picker-search__esc" @click="methodPickerVisible = false">esc</kbd>
        </div>
        <div ref="methodPickerListRef" class="method-picker-list">
          <div v-if="!filteredMethods.length" class="method-picker-empty">暂无匹配方法</div>
          <div
            v-for="(m, idx) in filteredMethods"
            :key="`${m.serviceName}#${m.methodKey}`"
            :ref="el => setMethodItemRef(el, idx)"
            class="method-picker-item"
            :class="{ 'is-active': methodCursor === idx }"
            @click="confirmMethod(m)"
            @mouseenter="methodCursor = idx"
          >
            <span class="method-picker-item__icon" :class="{ 'is-selected': isSelected(m) }">
              <Check v-if="isSelected(m)" :size="14" />
              <Zap v-else :size="14" />
            </span>
            <span class="method-picker-item__body">
              <span class="method-picker-item__name">
                <span class="method-picker-item__svc">{{ shortName(m.serviceName) }}#</span>{{ m.methodName }}
              </span>
            </span>
            <CornerDownLeft v-if="methodCursor === idx" :size="13" class="method-picker-item__enter" />
          </div>
        </div>
      </div>
    </n-modal>

    <!-- 主体：调用面板（全宽） -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <template v-if="selectedMethod">
          <!-- 方法信息 -->
          <div class="mb-4 bg-slate-50 rounded-lg p-3 border border-slate-100">
            <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">服务</div>
            <div class="font-mono text-xs text-slate-600 break-all leading-relaxed">{{ selectedMethod.serviceName }}</div>
            <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-2 mb-1">方法签名</div>
            <div class="font-mono text-xs text-indigo-600 break-all leading-relaxed">{{ selectedMethod.methodKey }}</div>
            <div v-if="selectedMethod.returnType" class="text-[10px] text-slate-400 mt-1">
              返回: <span class="font-mono">{{ shortName(selectedMethod.returnType) }}</span>
            </div>
          </div>

          <!-- 参数编辑器 -->
          <div v-if="templateLoading" class="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
            <n-spin :size="12" />
            自动填充参数模板…
          </div>
          <div
            v-for="(paramType, i) in selectedMethod.paramTypes"
            :key="i"
            class="mb-4"
          >
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-xs font-semibold text-slate-700">参数 {{ i + 1 }}</span>
              <span class="font-mono text-[10px] text-slate-400 truncate flex-1" :title="paramType">{{ shortName(paramType) }}</span>
              <button
                v-if="hasSchema(i)"
                class="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                @click="toggleSchema(i)"
              >{{ schemaOpen[i] ? '▾' : '▸' }} Schema</button>
              <button
                class="text-[10px] text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors"
                @click="fillEmpty(i)"
              >填充 {}</button>
            </div>

            <!-- schema 参考 -->
            <pre
              v-if="schemaOpen[i] && hasSchema(i)"
              class="text-[10px] font-mono bg-slate-50 border border-slate-100 rounded p-2 overflow-auto max-h-44 mb-1.5 leading-relaxed"
            >{{ formatSchema(i) }}</pre>

            <n-input
              v-model:value="paramValues[i]"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 14 }"
              placeholder="{}"
              class="font-mono text-xs"
              @blur="prettyParam(i)"
            />
          </div>

          <!-- 无参数方法 -->
          <div v-if="selectedMethod.paramTypes.length === 0" class="mb-4 text-xs text-slate-400 italic">
            该方法无需入参
          </div>

          <!-- 操作 -->
          <div class="flex items-center gap-2 mb-4">
            <n-button type="primary" :loading="invoking" @click="doInvoke">调用</n-button>
            <n-button
              v-if="invokeResult !== undefined || invokeError"
              ghost
              @click="resultModalShow = true"
            >查看结果</n-button>
            <span v-if="invokeMs != null" class="text-xs text-slate-400 ml-1">{{ invokeMs }}ms</span>
            <span v-if="invokeError" class="text-xs text-red-500 ml-1 truncate max-w-60" :title="invokeError">{{ invokeError }}</span>
          </div>
        </template>

        <!-- 空状态 -->
        <div v-else class="flex flex-col items-center justify-center h-full text-slate-300 select-none">
          <div class="text-5xl mb-3">🔌</div>
          <div class="text-sm">查询节点后选择方法进行调用</div>
        </div>
    </div>

    <!-- 结果弹窗 -->
    <OctoResultModal
      v-model:show="resultModalShow"
      :result="invokeResult"
      :appkey="appkeyInput ?? undefined"
      :invoke-ms="invokeMs"
      :method-label="selectedMethod ? `${shortName(selectedMethod.serviceName)}#${selectedMethod.methodName}` : undefined"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch, nextTick } from 'vue'
import { NInput, NButton, NSpin, NPopover, NModal, useMessage } from 'naive-ui'
import { ChevronDown, Search, Zap, Check, CornerDownLeft } from '@lucide/vue'
import { makeFetchItems } from '@/utils/dict'
import { matchQuery } from '@/utils/search'
import DictSelect from '@/components/DictSelect.vue'
import OctoResultModal from '@/components/OctoResultModal.vue'
import type { DictItem } from '@/types'
import { proxyGet } from '@/utils/proxy'

const OCTO_BASE = 'https://octo.mws-test.sankuai.com/api/octo/v2/thriftcheck'

defineOptions({ name: 'OctoView' })

const message = useMessage()

// ─── 类型 ──────────────────────────────────────────────────────────────────────

interface OctoNode {
  name: string; ip: string; port: number
  swimlane?: string; version?: string; cell?: string
}

interface OctoMethodItem {
  serviceName: string
  methodKey: string   // 完整签名如 "methodName(Type1,...):ReturnType"
  methodName: string  // 仅方法名
  paramTypes: string[]
  returnType: string
  schema: unknown     // API 返回的原始 schema（可为 null/object）
}

// ─── 配置 ──────────────────────────────────────────────────────────────────────

const LS_KEY = 'octo_query'

// ─── 状态 ──────────────────────────────────────────────────────────────────────

const appkeyInput   = ref<string | null>(null)
const swimlaneInput = ref<string | null>(null)

const nodesLoading  = ref(false)
const allNodes      = ref<OctoNode[]>([])
const currentNode   = ref<OctoNode | null>(null)

const methodsLoading = ref(false)
const methodGroups   = ref<Map<string, OctoMethodItem[]>>(new Map())
const methodFilter   = ref('')

const selectedMethod = ref<OctoMethodItem | null>(null)
const paramValues    = ref<string[]>([])
const schemaOpen     = reactive<Record<number, boolean>>({})

const invoking         = ref(false)
const templateLoading  = ref(false)
const invokeResult     = ref<unknown>(undefined)
const invokeError      = ref('')
const invokeMs         = ref<number | null>(null)
const resultModalShow  = ref(false)

// 方法选择器
const methodPickerVisible  = ref(false)
const methodCursor         = ref(0)
const methodPickerInputRef = ref<HTMLInputElement | null>(null)
const methodPickerListRef  = ref<HTMLElement | null>(null)
const methodItemRefs       = ref<(HTMLElement | null)[]>([])

// ─── 计算 ──────────────────────────────────────────────────────────────────────

const allMethods = computed((): OctoMethodItem[] => {
  const result: OctoMethodItem[] = []
  for (const methods of methodGroups.value.values()) result.push(...methods)
  return result
})

const totalMethodCount = computed(() => allMethods.value.length)

const filteredMethods = computed((): OctoMethodItem[] => {
  const q = methodFilter.value.trim()
  if (!q) return allMethods.value
  return allMethods.value.filter(m => matchQuery(q, shortName(m.serviceName), m.methodName))
})

const prettyResult = computed(() => {
  if (invokeResult.value === undefined) return ''
  try { return JSON.stringify(invokeResult.value, null, 2) } catch { return String(invokeResult.value) }
})

const parsedResult = computed((): { traceId: string; returnStr: string } | null => {
  const r = invokeResult.value
  if (!r || typeof r !== 'object') return null
  const obj = r as Record<string, unknown>
  const traceId = typeof obj.traceId === 'string' ? obj.traceId : ''
  const returnVal = 'return' in obj ? obj['return'] : undefined
  if (!traceId && returnVal === undefined) return null
  const returnStr = returnVal === undefined
    ? prettyResult.value
    : (typeof returnVal === 'string' ? returnVal : JSON.stringify(returnVal, null, 2))
  return { traceId, returnStr }
})

// ─── 辅助 ──────────────────────────────────────────────────────────────────────

function shortName(full: string): string {
  if (!full) return ''
  return full.split('.').at(-1) ?? full
}

function parseMethodSig(sig: string): { methodName: string; paramTypes: string[]; returnType: string } {
  const parenOpen  = sig.indexOf('(')
  if (parenOpen === -1) return { methodName: sig, paramTypes: [], returnType: '' }
  const parenClose = sig.lastIndexOf(')')
  const methodName = sig.slice(0, parenOpen)
  const paramsStr  = parenClose > parenOpen ? sig.slice(parenOpen + 1, parenClose) : ''
  const returnType = parenClose < sig.length - 1 ? sig.slice(parenClose + 2) : ''
  const paramTypes = paramsStr ? paramsStr.split(',').map(s => s.trim()).filter(Boolean) : []
  return { methodName, paramTypes, returnType }
}

function isSelected(m: OctoMethodItem): boolean {
  return selectedMethod.value?.serviceName === m.serviceName && selectedMethod.value?.methodKey === m.methodKey
}

function isCurrentNode(node: OctoNode): boolean {
  return currentNode.value?.ip === node.ip && currentNode.value?.port === node.port
}

async function switchNode(node: OctoNode) {
  if (isCurrentNode(node)) return
  currentNode.value = node
  selectedMethod.value = null
  paramValues.value = []
  clearResult()
  await loadMethods()
}

function copyTraceId(id: string) {
  navigator.clipboard.writeText(id).then(() => message.success('TraceId 已复制'))
}

function hasSchema(paramIdx: number): boolean {
  const s = selectedMethod.value?.schema
  if (!s || typeof s !== 'object') return false
  return Object.keys(s as object).length > 0
}

function formatSchema(paramIdx: number): string {
  const schema = selectedMethod.value?.schema
  if (!schema) return ''
  if (Array.isArray(schema)) {
    const entry = schema[paramIdx]
    return JSON.stringify(entry ?? schema, null, 2)
  }
  return JSON.stringify(schema, null, 2)
}

function toggleSchema(i: number) {
  schemaOpen[i] = !schemaOpen[i]
}

function fillEmpty(i: number) {
  if (!paramValues.value[i]?.trim()) paramValues.value[i] = '{}'
}

function prettyParam(i: number) {
  const v = paramValues.value[i]?.trim()
  if (!v) return
  try { paramValues.value[i] = JSON.stringify(JSON.parse(v), null, 2) } catch { /* leave as-is */ }
}

function clearResult() {
  invokeResult.value = undefined
  invokeError.value  = ''
  invokeMs.value     = null
}

// ─── 方法选择器 ────────────────────────────────────────────────────────────────

watch(methodPickerVisible, async (v) => {
  if (v) {
    methodCursor.value  = filteredMethods.value.findIndex(m => isSelected(m))
    if (methodCursor.value < 0) methodCursor.value = 0
    methodItemRefs.value = []
    await nextTick()
    methodPickerInputRef.value?.focus()
  }
})

watch(methodFilter, () => {
  methodCursor.value = 0
  methodItemRefs.value = []
})

function setMethodItemRef(el: unknown, idx: number) {
  methodItemRefs.value[idx] = el as HTMLElement | null
}

function moveMethodCursor(dir: number) {
  const max  = filteredMethods.value.length - 1
  const next = Math.max(0, Math.min(max, methodCursor.value + dir))
  methodCursor.value = next
  nextTick(() => methodItemRefs.value[next]?.scrollIntoView({ block: 'nearest' }))
}

function confirmMethod(m: OctoMethodItem) {
  methodPickerVisible.value = false
  selectMethod(m)
}

function confirmMethodByEnter() {
  const m = filteredMethods.value[methodCursor.value]
  if (m) confirmMethod(m)
}

// ─── 字典加载（供 DictSelect 使用）─────────────────────────────────────────────

async function fetchAppkeyItems(): Promise<DictItem[]> {
  return makeFetchItems('appkey')()
}

async function fetchSwimlaneItems(): Promise<DictItem[]> {
  const items = await makeFetchItems('swimlane')()
  return [{ id: '', name: '主干', value: '', description: '', pinned: false, lastUsedAt: 0 }, ...items]
}

// ─── 参数模板自动填充 ──────────────────────────────────────────────────────────

async function loadParamTemplate(m: OctoMethodItem) {
  if (!m.paramTypes.length || !currentNode.value || !appkeyInput.value) return
  templateLoading.value = true
  try {
    const { ip, port } = currentNode.value
    const qs = new URLSearchParams({
      appkey:      appkeyInput.value,
      serviceName: m.serviceName,
      method:      m.methodKey,
      host:        ip,
      port:        String(port),
    })
    const json = await proxyGet<{ success: boolean; data?: string[]; msg?: string }>(
      `${OCTO_BASE}/paramTemplate?${qs}`
    )
    if (json.success && Array.isArray(json.data) && json.data.length) {
      paramValues.value = json.data.map(s => {
        try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
      })
    }
  } catch { /* 静默失败，保留空白占位 */ }
  finally { templateLoading.value = false }
}

// ─── 节点查询 ──────────────────────────────────────────────────────────────────

async function doQueryNodes() {
  const appkey = appkeyInput.value?.trim()
  if (!appkey) return

  nodesLoading.value  = true
  currentNode.value   = null
  methodGroups.value  = new Map()
  selectedMethod.value = null
  clearResult()

  try {
    const qs = new URLSearchParams({ appkey, env: 'test' })
    const sl = swimlaneInput.value ?? ''
    if (sl) qs.set('swimlane', sl)

    const res  = await fetch(`/api/octo-invoke/nodes?${qs}`)
    const json = await res.json() as { success: boolean; data: OctoNode[]; msg?: string }
    if (!json.success) throw new Error(json.msg || '查询节点失败')

    allNodes.value = json.data
    if (!json.data.length) { message.warning('未找到匹配节点'); return }

    currentNode.value = json.data[0]
    saveLs()
    await loadMethods()
  } catch (e) {
    message.error(`查询节点失败: ${(e as Error).message}`)
  } finally {
    nodesLoading.value = false
  }
}

// ─── 方法加载 ──────────────────────────────────────────────────────────────────

async function loadMethods() {
  if (!currentNode.value || !appkeyInput.value) return
  methodsLoading.value = true
  try {
    const { ip, port } = currentNode.value
    const qs  = new URLSearchParams({ appkey: appkeyInput.value, host: ip, port: String(port) })
    const res  = await fetch(`/api/octo-invoke/methods?${qs}`)
    const json = await res.json() as { success: boolean; data?: Record<string, Record<string, unknown>>; msg?: string }
    if (!json.success) throw new Error(json.msg || '加载方法失败')

    const groups = new Map<string, OctoMethodItem[]>()
    for (const [svcName, methodsObj] of Object.entries(json.data ?? {})) {
      const items: OctoMethodItem[] = Object.entries(methodsObj).map(([methodKey, schema]) => {
        const { methodName, paramTypes, returnType } = parseMethodSig(methodKey)
        return { serviceName: svcName, methodKey, methodName, paramTypes, returnType, schema }
      })
      groups.set(svcName, items)
    }
    methodGroups.value = groups
  } catch (e) {
    message.error(`加载方法失败: ${(e as Error).message}`)
  } finally {
    methodsLoading.value = false
  }
}

// ─── 方法选择 ──────────────────────────────────────────────────────────────────

function selectMethod(m: OctoMethodItem) {
  selectedMethod.value = m
  paramValues.value    = m.paramTypes.map(() => '')
  Object.keys(schemaOpen).forEach(k => { delete schemaOpen[Number(k)] })
  clearResult()
  loadParamTemplate(m)
}

// ─── 调用 ──────────────────────────────────────────────────────────────────────

async function doInvoke() {
  const m      = selectedMethod.value
  const node   = currentNode.value
  const appkey = appkeyInput.value?.trim()
  if (!m || !node || !appkey) return

  invoking.value     = true
  invokeResult.value = undefined
  invokeError.value  = ''
  invokeMs.value     = null

  const t0 = Date.now()
  try {
    const params = paramValues.value.map(v => v.trim() || '{}')

    const body = {
      appkey,
      env:       'test',
      serviceName: m.serviceName,
      method:    m.methodKey,
      params,
      nodeHost:    node.ip,
      nodePort:    node.port,
      nodeName:    node.name,
      nodeVersion: node.version ?? 'mtthrift-v2.11.2',
      nodeSwimlane: node.swimlane ?? '',
      nodeCell:    node.cell ?? '',
    }

    const res  = await fetch('/api/octo-invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    invokeMs.value     = Date.now() - t0
    invokeResult.value = await res.json()
  } catch (e) {
    invokeMs.value    = Date.now() - t0
    invokeError.value = (e as Error).message
  } finally {
    invoking.value = false
    resultModalShow.value = true
  }
}

// ─── localStorage 持久化 ────────────────────────────────────────────────────────

function saveLs() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      appkey:   appkeyInput.value,
      swimlane: swimlaneInput.value,
    }))
  } catch { /* ignore */ }
}

function restoreLs() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const { appkey, swimlane } = JSON.parse(raw)
    if (appkey)   appkeyInput.value  = appkey
    if (swimlane) swimlaneInput.value = swimlane
  } catch { /* ignore */ }
}

// ─── 初始化 ────────────────────────────────────────────────────────────────────

onMounted(() => {
  restoreLs()
})
</script>

<style scoped>
.method-picker-wrap {
  width: 580px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06);
  overflow: hidden;
  outline: none;
  align-self: flex-start;
  margin-top: 12vh;
}

.method-picker-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  height: 58px;
  border-bottom: 1px solid #f1f5f9;
}

.method-picker-search__icon { color: #94a3b8; flex-shrink: 0; }

.method-picker-search__input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 17px;
  font-weight: 400;
  color: #0f172a;
  background: transparent;
  caret-color: #6366f1;
}
.method-picker-search__input::placeholder { color: #cbd5e1; }

.method-picker-search__count {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
  white-space: nowrap;
}

.method-picker-search__esc {
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.1s;
}
.method-picker-search__esc:hover { background: #e2e8f0; }

.method-picker-list {
  max-height: 400px;
  overflow-y: auto;
  padding: 6px 0;
}

.method-picker-empty {
  text-align: center;
  padding: 28px 0;
  color: #94a3b8;
  font-size: 13px;
}

.method-picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  cursor: pointer;
  transition: background 0.08s;
}
.method-picker-item.is-active { background: #4f46e5; }
.method-picker-item.is-active .method-picker-item__name { color: #fff; }
.method-picker-item.is-active .method-picker-item__svc  { color: rgba(255,255,255,0.55); }
.method-picker-item.is-active .method-picker-item__icon { color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.15); }
.method-picker-item.is-active .method-picker-item__enter { color: rgba(255,255,255,0.6); }

.method-picker-item__icon {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  color: #64748b;
  flex-shrink: 0;
}
.method-picker-item__icon.is-selected { background: #eef2ff; color: #6366f1; }

.method-picker-item__body { flex: 1; min-width: 0; }

.method-picker-item__name {
  font-size: 14px;
  font-weight: 500;
  color: #0f172a;
  word-break: break-all;
}

.method-picker-item__svc {
  font-weight: 400;
  color: #94a3b8;
}

.method-picker-item__enter { color: #cbd5e1; flex-shrink: 0; }
</style>
