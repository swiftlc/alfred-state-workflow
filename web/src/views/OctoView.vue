<template>
  <ContextGroup>
  <div class="flex flex-col overflow-hidden" style="height: 100%">

    <!-- 标题 + 刷新 -->
    <div class="shrink-0 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-lg font-semibold text-slate-800 tracking-tight">Octo RPC</h1>
        <div class="flex items-center gap-2">
          <!-- ✦ 加载进度：两个步骤明确展示 -->
          <span v-if="nodesLoading || methodsLoading"
                class="flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full"
                style="background:#f1f5f9;color:#64748b">
            <n-spin :size="11" />
            <span>{{ nodesLoading ? '1/2 查询节点' : '2/2 加载方法' }}</span>
          </span>
          <n-button size="tiny" ghost @click="openFavoritesModal">
            收藏{{ historyEntries.length ? ` (${historyEntries.length})` : '' }}
            <span class="octo-kbd">⌘K</span>
          </n-button>
          <n-button size="tiny" :loading="nodesLoading" :disabled="!appkeyInput" ghost @click="doQueryNodes">
            刷新节点
          </n-button>
        </div>
      </div>

      <!-- 主 chip 行：appkey / 节点 / 接口 -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <ContextItem
          context-key="appkey"
          :value="appkeyInput ?? ''"
          label="Appkey"
          :fetch-items="fetchAppkeyItems"
          custom-edit
          @edit="onAppkeyEdit"
        >
          <span class="octo-chip" :class="appkeyInput ? 'octo-chip--slate' : 'octo-chip--empty'">
            <span class="font-mono">{{ appkeyInput || 'Appkey…' }}</span>
          </span>
        </ContextItem>

        <span class="octo-sep">/</span>

        <template v-if="currentNode">
          <ContextItem
            context-key="node"
            :value="`${currentNode.ip}:${currentNode.port}`"
            label="节点"
            :fetch-items="fetchNodeItems"
            custom-edit
            @action="handleNodeAction"
            @edit="handleNodeEdit"
          >
            <span class="octo-chip octo-chip--emerald">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <span class="font-mono">{{ currentNode.ip }}:{{ currentNode.port }}</span>
              <span class="text-emerald-500">{{ currentNode.name }}</span>
            </span>
          </ContextItem>
        </template>
        <span v-else class="octo-chip octo-chip--empty">
          <n-spin v-if="nodesLoading" :size="10" />
          <span v-else>节点…</span>
        </span>

        <span class="octo-sep">/</span>

        <template v-if="selectedMethod">
          <ContextItem
            context-key="reference"
            :value="`${selectedMethod.serviceName}#${selectedMethod.methodName}`"
            label="接口引用"
            :meta="{ serviceName: selectedMethod.serviceName, methodName: selectedMethod.methodName }"
            edit-target="custom"
            @edit:open="methodPickerVisible = true"
          >
            <span class="octo-chip octo-chip--indigo">
              <span class="text-indigo-400 flex-shrink-0">{{ shortName(selectedMethod.serviceName) }}#</span>
              <span class="font-medium">{{ selectedMethod.methodName }}</span>
            </span>
          </ContextItem>
        </template>
        <span
          v-else-if="currentNode"
          class="octo-chip octo-chip--empty"
          :class="!methodsLoading && 'octo-chip--clickable'"
          @click="!methodsLoading && (methodPickerVisible = true)"
        >
          <n-spin v-if="methodsLoading" :size="10" />
          <span v-else>{{ totalMethodCount ? `方法 (${totalMethodCount})…` : '方法…' }}</span>
        </span>

        <!-- 右侧：泳道偏好 + 节点数 -->
        <div class="ml-auto flex items-center gap-2 flex-shrink-0">
          <!-- 泳道偏好：始终可见，标准 ContextItem 菜单，选项从已加载节点实时派生 -->
          <ContextItem
            context-key="swimlane"
            :value="swimlanePreference ?? ''"
            label="泳道偏好"
            :fetch-items="fetchSwimlaneItems"
            custom-edit
            bare
            @edit="onSwimlaneEdit"
          >
            <span class="octo-swim-badge" :class="swimlaneDisplay ? '' : 'octo-swim-badge--empty'">
              <span class="octo-swim-badge__dot" />
              {{ swimlaneDisplay || '泳道…' }}
            </span>
          </ContextItem>
          <span v-if="allNodes.length > 0" class="text-xs text-slate-400">{{ allNodes.length }} 节点</span>
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


    <!-- 主体：调用面板 -->
    <div class="flex-1 min-h-0 flex gap-0" style="overflow:hidden">
    <div style="flex:1; overflow-y:auto">
      <template v-if="selectedMethod">

        <!-- 参数编辑器 -->
        <div v-if="templateLoading" class="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
          <n-spin :size="12" />
          自动填充参数模板…
        </div>
        <div v-for="(paramType, i) in selectedMethod.paramTypes" :key="i" class="mb-4">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-xs font-semibold text-slate-700">参数 {{ i + 1 }}</span>
            <span class="font-mono text-[10px] text-slate-400 truncate" :title="paramType">{{ shortName(paramType) }}</span>
            <!-- 预设 badge：左侧 ContextItem 标准菜单，右侧箭头折叠 -->
            <span
              v-if="hasPreset(i)"
              class="param-preset-badge"
              :class="presetCollapsed[i] ? 'param-preset-badge--collapsed' : 'param-preset-badge--open'"
            >
              <ContextItem
                context-key="tenantId"
                :value="tenantIdInput ?? ''"
                label="TenantId"
                :fetch-items="fetchTenantItems"
                custom-edit
                bare
                @edit="onTenantEdit"
              >
                <span class="param-preset-badge__left">✨ 预设{{ tenantIdInput ? ` · ${tenantIdInput}` : '' }}</span>
              </ContextItem>
              <span
                class="param-preset-badge__arrow"
                :title="presetCollapsed[i] ? '展开' : '折叠'"
                @click.stop="presetCollapsed[i] = !presetCollapsed[i]"
              >{{ presetCollapsed[i] ? '▸' : '▾' }}</span>
            </span>
            <span class="flex-1" />
            <button
              v-if="hasSchema(i) && !presetCollapsed[i]"
              class="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              @click="toggleSchema(i)"
            >{{ schemaOpen[i] ? '▾' : '▸' }} Schema</button>
            <button
              v-if="!hasPreset(i)"
              class="text-[10px] text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors"
              @click="fillEmpty(i)"
            >填充 {}</button>
          </div>
          <!-- 折叠时只显示紧凑提示 -->
          <div v-if="hasPreset(i) && presetCollapsed[i]" class="param-preset-collapsed">
            {{ shortName(selectedMethod.paramTypes[i]) }} 已由预设自动注入（Shepherd / Octo 鉴权上下文），点击 ✨ 展开编辑或修改租户
          </div>
          <!-- 展开时显示完整编辑区 -->
          <template v-else>
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
          </template>
        </div>

        <div v-if="selectedMethod.paramTypes.length === 0" class="mb-4 text-xs text-slate-400 italic">
          该方法无需入参
        </div>

        <!-- 调用按钮 -->
        <div class="flex items-center gap-2 mb-4">
          <n-button type="primary" :loading="invoking" @click="doInvoke">调用</n-button>
          <span v-if="invokeMs != null" class="text-xs text-slate-400">{{ invokeMs }}ms</span>
        </div>

        <!-- 内联调用结果 -->
        <div v-if="invokeResult !== undefined || invokeError" class="invoke-result">
          <!-- 结果头 -->
          <div class="invoke-result__header">
            <!-- 左：状态 + 耗时 + msg -->
            <div class="invoke-result__left">
              <span v-if="invokeError" class="invoke-result__badge invoke-result__badge--error">✗ 失败</span>
              <template v-else-if="parsedResult">
                <span
                  class="invoke-result__badge"
                  :class="parsedResult.success ? 'invoke-result__badge--success' : 'invoke-result__badge--fail'"
                >{{ parsedResult.success ? '✓ 成功' : '✗ 失败' }}</span>
                <span v-if="!parsedResult.success && parsedResult.code !== null" class="invoke-result__code">code {{ parsedResult.code }}</span>
              </template>
              <span v-if="invokeMs != null" class="invoke-result__ms">{{ invokeMs }}ms</span>
              <span v-if="parsedResult?.msg && !invokeError" class="invoke-result__msg">{{ parsedResult.msg }}</span>
            </div>

            <!-- 右：traceId + 收藏 -->
            <div class="invoke-result__right">
              <ContextItem
                v-if="parsedResult?.traceId"
                context-key="traceId"
                :value="parsedResult.traceId"
                label="TraceId"
                :meta="{ appkey: appkeyInput ?? 'ALL' }"
              >
                <span class="octo-chip octo-chip--amber font-mono" style="font-size:11px">{{ parsedResult.traceId }}</span>
              </ContextItem>

              <!-- inline 收藏区 -->
              <template v-if="saveDraft.active">
                <input
                  ref="saveDraftInputRef"
                  v-model="saveDraft.note"
                  class="invoke-save-input"
                  placeholder="备注…"
                  autocomplete="off"
                  spellcheck="false"
                  @keydown.enter.prevent="doSave"
                  @keydown.esc.prevent="cancelSaveDraft"
                />
                <button class="invoke-save-btn invoke-save-btn--confirm" title="保存 (Enter)" @click="doSave">↵</button>
                <button class="invoke-save-btn invoke-save-btn--cancel" title="取消 (Esc)" @click="cancelSaveDraft">✕</button>
              </template>
              <button
                v-else
                class="invoke-save-btn"
                :class="{ 'invoke-save-btn--saved': saveDraft.saved }"
                :disabled="saveDraft.saved"
                title="收藏此次调用"
                @click="openSaveDraft"
              >{{ saveDraft.saved ? '✓ 已收藏' : '⭐ 收藏' }}</button>
            </div>
          </div>
          <!-- 错误详情 -->
          <div v-if="invokeError" class="invoke-result__error">{{ invokeError }}</div>
          <!-- 返回数据 -->
          <MonacoPreview
            v-else-if="parsedResult?.returnStr"
            :content="parsedResult.returnStr"
            height="480px"
            style="border:none; border-top:1px solid #e2e8f0; border-radius:0;"
          />
        </div>

      </template>

      <!-- 空状态 -->
      <div v-else class="flex flex-col items-center justify-center h-full text-slate-300 select-none">
        <div class="text-5xl mb-3">🔌</div>
        <div class="text-sm">查询节点后选择方法进行调用</div>
      </div>
    </div><!-- 结束参数区 -->

    </div><!-- 结束主体 flex-row -->

  </div>

  <!-- 收藏弹窗 -->
  <OctoFavoritesModal
    :show="favoritesModalOpen"
    :entries="historyEntries"
    :active-entry-id="activeHistoryId"
    @update:show="v => { if (!v) onFavoritesClose() }"
    @restore="restoreFromHistory"
    @remove="historyRemove"
    @update-note="historyUpdateNote"
    @clear="historyClear"
  />

  </ContextGroup>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onDeactivated, reactive, watch, nextTick } from 'vue'
import { NInput, NButton, NSpin, NModal, useMessage } from 'naive-ui'
import { Search, Zap, Check, CornerDownLeft } from '@lucide/vue'
import { makeFetchItems } from '@/utils/dict'
import { matchQuery, shortName } from '@/utils/search'
import ContextItem from '@/components/ContextItem.vue'
import ContextGroup from '@/components/ContextGroup.vue'
import MonacoPreview from '@/components/MonacoPreview.vue'
import type { ContextDataItem } from '@/types'
import type { FetchItemsFn } from '@/utils/dict'
import { proxyGet } from '@/utils/proxy'
import { PARAM_PRESETS } from '@/config/paramPresets'
import { useOctoHistory } from '@/composables/useOctoHistory'
import type { OctoHistoryEntry } from '@/composables/useOctoHistory'
import OctoFavoritesModal from '@/components/OctoFavoritesModal.vue'

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

const appkeyInput        = ref<string | null>(null)
const tenantIdInput      = ref<string | null>(null)
const swimlanePreference = ref<string | null>(null)
// 显示值：优先实际节点泳道，节点未加载时降级展示存储偏好
const swimlaneDisplay    = computed(() => currentNode.value?.swimlane ?? swimlanePreference.value ?? null)

const nodesLoading   = ref(false)
const allNodes       = ref<OctoNode[]>([])
const currentNode    = ref<OctoNode | null>(null)

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

// ─── 调用历史 ──────────────────────────────────────────────────────────────────

const { entries: historyEntries, save: historySave, remove: historyRemove, clear: historyClear,
        updateNote: historyUpdateNote } = useOctoHistory()

// 收藏弹窗开关
const favoritesModalOpen = ref(false)
let favoritesJustClosed = false

function openFavoritesModal() {
  if (favoritesJustClosed) return
  favoritesModalOpen.value = true
}

function onFavoritesClose() {
  favoritesModalOpen.value = false
  favoritesJustClosed = true
  setTimeout(() => { favoritesJustClosed = false }, 300)
}

// 当前已从历史恢复的条目 id（用于高亮）
const activeHistoryId = ref<string | null>(null)

// inline 收藏草稿状态
const saveDraft = reactive({ active: false, note: '', saved: false })
const saveDraftInputRef = ref<HTMLInputElement | null>(null)

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


interface ParsedInvokeResult {
  success:   boolean
  code:      number | null
  msg:       string | null
  traceId:   string
  returnStr: string
}

const parsedResult = computed((): ParsedInvokeResult | null => {
  const r = invokeResult.value
  if (r === undefined) return null
  if (!r || typeof r !== 'object') return { success: false, code: null, msg: null, traceId: '', returnStr: String(r) }

  const obj  = r as Record<string, unknown>
  const data = (obj.data && typeof obj.data === 'object') ? obj.data as Record<string, unknown> : null

  // traceId: data.traceId 优先，fallback obj.traceId
  const traceId = typeof data?.traceId === 'string' ? data.traceId
    : typeof obj.traceId === 'string' ? obj.traceId : ''

  // 返回值：data.return → data → obj.return → 原始 obj
  const rawReturn = data?.['return'] !== undefined ? data['return']
    : obj['return'] !== undefined ? obj['return']
    : (data ?? r)

  let returnStr = ''
  if (typeof rawReturn === 'string') {
    try { returnStr = JSON.stringify(JSON.parse(rawReturn), null, 2) } catch { returnStr = rawReturn }
  } else if (rawReturn !== null && rawReturn !== undefined) {
    returnStr = JSON.stringify(rawReturn, null, 2)
  }

  return {
    success:   obj.success === true || obj.code === 0 || obj.code === '0',
    code:      obj.code != null ? Number(obj.code) : null,
    msg:       typeof obj.msg === 'string' && obj.msg ? obj.msg : null,
    traceId,
    returnStr,
  }
})

// ─── 辅助 ──────────────────────────────────────────────────────────────────────


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

// ─── appkey / 泳道 ContextItem 编辑回调 ─────────────────────────────────────────

function onAppkeyEdit(item: ContextDataItem) {
  appkeyInput.value = item.value ?? null
}

function onTenantEdit(item: ContextDataItem) {
  tenantIdInput.value = item.value ?? null
  saveLs()
  if (selectedMethod.value) applyParamPresets(selectedMethod.value, true)
}

const fetchNodeItems: FetchItemsFn = () =>
  Promise.resolve(allNodes.value.map(n => ({
    id:          `${n.ip}:${n.port}`,
    name:        `${n.ip}:${n.port}`,
    value:       `${n.ip}:${n.port}`,
    description: n.name || '',
    tags:        n.swimlane ? [{ label: n.swimlane, color: 'indigo' as const }] : [],
    pinned:      false,
    lastUsedAt:  0,
  })))

function handleNodeAction(key: string) {
  if (key === 'machine_jump' && currentNode.value) {
    const { ip, port } = currentNode.value
    // TODO: 跳板机跳转，待实现具体协议（ssh / web terminal）
    message.info(`机器跳转: ${ip}:${port}（待实现）`)
  }
}

function handleNodeEdit(item: ContextDataItem) {
  const [ip, portStr] = (item.value ?? '').split(':')
  const node = allNodes.value.find(n => n.ip === ip && n.port === Number(portStr))
  if (node) switchNode(node)
}

function isCurrentNode(node: OctoNode): boolean {
  return currentNode.value?.ip === node.ip && currentNode.value?.port === node.port
}

async function switchNode(node: OctoNode) {
  if (isCurrentNode(node)) return
  currentNode.value        = node
  swimlanePreference.value = node.swimlane ?? null
  saveLs()
  selectedMethod.value = null
  paramValues.value = []
  clearResult()
  await loadMethods()
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

// ─── 自动重查：appkey 变化时重新拉节点 ─────────────────────────────────────────

// watchActive 防止 onMounted restoreLs 时触发
let watchActive = false

watch(appkeyInput, () => {
  if (!watchActive) return
  if (appkeyInput.value) doQueryNodes()
})

// ─── 字典加载（供 DictSelect 使用）─────────────────────────────────────────────

// 直接使用 makeFetchItems 返回值，保留 .clearCache 等附属属性
const fetchAppkeyItems  = makeFetchItems('appkey')
const fetchTenantItems  = makeFetchItems('tenant')

// 泳道选项：从已加载节点的 swimlane 字段实时派生（支持手写 allowInput）
const fetchSwimlaneItems: FetchItemsFn = () => {
  const unique = [...new Set(allNodes.value.map(n => n.swimlane).filter((s): s is string => !!s))]
  return Promise.resolve(unique.map(s => ({ id: s, name: s, value: s, description: '', pinned: false, lastUsedAt: 0 })))
}

function onSwimlaneEdit(item: ContextDataItem) {
  swimlanePreference.value = item.value?.trim() || null
  saveLs()
  // 立即在已加载节点中切换到匹配的节点
  if (allNodes.value.length && swimlanePreference.value) {
    const matched = allNodes.value.find(n => n.swimlane === swimlanePreference.value)
    if (matched && !isCurrentNode(matched)) switchNode(matched)
  }
}

// preset 参数折叠状态（true = 折叠展示）
const presetCollapsed = reactive<Record<number, boolean>>({})

function hasPreset(i: number): boolean {
  return !!PARAM_PRESETS[shortName(selectedMethod.value?.paramTypes[i] ?? '')]
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
      // 有本地 preset 的参数不用 API 模板覆盖，由 applyParamPresets 保障
      paramValues.value = json.data.map((s, i) => {
        if (PARAM_PRESETS[shortName(m.paramTypes[i])]) return paramValues.value[i] ?? ''
        try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
      })
    }
  } catch { /* 静默失败，保留空白占位 */ }
  finally { templateLoading.value = false }
  applyParamPresets(m)
}

// 对 API 模板未覆盖的空参数，用本地 PARAM_PRESETS 填充（不覆盖已有值）
// force=true 时无视已有值，强制覆盖（tenantId 变化时用）
function applyParamPresets(m: OctoMethodItem, force = false) {
  const ctx = { tenantId: tenantIdInput.value ?? undefined }
  for (let i = 0; i < m.paramTypes.length; i++) {
    if (!force && paramValues.value[i]?.trim()) continue
    const presetFn = PARAM_PRESETS[shortName(m.paramTypes[i])]
    if (presetFn) paramValues.value[i] = JSON.stringify(presetFn(ctx), null, 2)
  }
}

// ─── 节点查询 ──────────────────────────────────────────────────────────────────

async function doQueryNodes(): Promise<boolean> {
  const appkey = appkeyInput.value?.trim()
  if (!appkey) return false

  nodesLoading.value  = true
  currentNode.value   = null
  methodGroups.value  = new Map()
  selectedMethod.value = null
  clearResult()

  try {
    const qs = new URLSearchParams({ appkey, env: 'test' })
    const res  = await fetch(`/api/octo-invoke/nodes?${qs}`)
    const json = await res.json() as { success: boolean; data: OctoNode[]; msg?: string }
    if (!json.success) throw new Error(json.msg || '查询节点失败')

    allNodes.value = json.data
    if (!json.data.length) { message.warning('未找到匹配节点'); return false }

    const preferred = swimlanePreference.value
      ? json.data.find(n => n.swimlane === swimlanePreference.value) ?? json.data[0]
      : json.data[0]
    currentNode.value = preferred
    saveLs()
    await loadMethods()
    return true
  } catch (e) {
    message.error(`查询节点失败: ${(e as Error).message}`)
    return false
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
  // preset 参数默认折叠
  Object.keys(presetCollapsed).forEach(k => { delete presetCollapsed[Number(k)] })
  m.paramTypes.forEach((type, i) => {
    if (PARAM_PRESETS[shortName(type)]) presetCollapsed[i] = true
  })
  clearResult()
  applyParamPresets(m)
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
  }
}

// ─── 历史收藏 ──────────────────────────────────────────────────────────────────

async function openSaveDraft() {
  saveDraft.active = true
  saveDraft.note   = ''
  await nextTick()
  saveDraftInputRef.value?.focus()
}

function cancelSaveDraft() {
  saveDraft.active = false
  saveDraft.note   = ''
}

function doSave() {
  const m      = selectedMethod.value
  const appkey = appkeyInput.value?.trim()
  if (!m || !appkey) {
    message.warning('请先完成调用再收藏')
    return
  }

  const savedId = historySave(
    {
      appkey,
      swimlane:    currentNode.value?.swimlane,
      serviceName: m.serviceName,
      methodKey:   m.methodKey,
      methodName:  m.methodName,
      paramTypes:  m.paramTypes,
      paramValues: [...paramValues.value],
      result:      invokeResult.value,
      invokeMs:    invokeMs.value,
      success:     parsedResult.value?.success ?? false,
    },
    saveDraft.note.trim(),
  )
  if (savedId === null) {
    message.warning('所有条目均已置顶，无法保存，请先取消部分置顶')
    return
  }
  saveDraft.active = false
  saveDraft.note   = ''
  saveDraft.saved  = true
  activeHistoryId.value = null
  setTimeout(() => { saveDraft.saved = false }, 1500)
}

// ─── 历史恢复 ──────────────────────────────────────────────────────────────────

async function restoreFromHistory(entry: OctoHistoryEntry) {
  onFavoritesClose()
  activeHistoryId.value = entry.id

  // 1. 如果 appkey 不同 或 节点尚未加载，重新查节点（泳道偏好驱动节点选择）
  if (appkeyInput.value !== entry.appkey || !currentNode.value) {
    appkeyInput.value = entry.appkey
    if (entry.swimlane) swimlanePreference.value = entry.swimlane
    const ok = await doQueryNodes()
    if (!ok) {
      message.warning('节点查询失败，无法恢复调用现场')
      return
    }
  } else if (entry.swimlane && entry.swimlane !== swimlanePreference.value) {
    // appkey 相同但泳道不同：切换泳道偏好并选匹配节点
    swimlanePreference.value = entry.swimlane
    const matched = allNodes.value.find(n => n.swimlane === entry.swimlane)
    if (matched && !isCurrentNode(matched)) await switchNode(matched)
  }

  // 2. 恢复方法 + 参数（不切换具体节点，由当前节点执行）
  const method = allMethods.value.find(
    m => m.serviceName === entry.serviceName && m.methodKey === entry.methodKey,
  )
  if (method) {
    selectedMethod.value = method
    paramValues.value    = [...entry.paramValues]
    Object.keys(schemaOpen).forEach(k => { delete schemaOpen[Number(k)] })
    clearResult()
  } else {
    selectedMethod.value = {
      serviceName: entry.serviceName,
      methodKey:   entry.methodKey,
      methodName:  entry.methodName,
      paramTypes:  entry.paramTypes,
      returnType:  '',
      schema:      null,
    }
    paramValues.value = [...entry.paramValues]
    clearResult()
  }
}

// ─── localStorage 持久化 ────────────────────────────────────────────────────────

function saveLs() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      appkey:    appkeyInput.value,
      tenantId:  tenantIdInput.value,
      swimlane:  swimlanePreference.value,
    }))
  } catch { /* ignore */ }
}

function restoreLs() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const { appkey, tenantId, swimlane } = JSON.parse(raw)
    if (appkey)   appkeyInput.value        = appkey
    if (tenantId) tenantIdInput.value      = tenantId
    if (swimlane) swimlanePreference.value = swimlane
  } catch { /* ignore */ }
}

// ─── 初始化 ────────────────────────────────────────────────────────────────────

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    openFavoritesModal()
  }
}

onMounted(async () => {
  restoreLs()
  await nextTick()
  watchActive = true
  if (appkeyInput.value) doQueryNodes()
})

onActivated(() => {
  window.addEventListener('keydown', onKeydown)
})

onDeactivated(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
/* ─── 快捷键 badge ── */
.octo-kbd {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-family: monospace;
  color: #94a3b8;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 3px;
  padding: 0 4px;
  margin-left: 4px;
  line-height: 1.6;
  letter-spacing: 0;
}

/* ─── 统一 chip 样式 ──────────────────────────────────────────── */
.octo-chip {
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

.octo-chip--slate {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #475569;
}
.octo-chip--slate:hover { background: #e8ecf2; border-color: #c8d0db; }

.octo-chip--emerald {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #065f46;
}
.octo-chip--emerald:hover { background: #d1fae5; border-color: #6ee7b7; }

.octo-chip--indigo {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #4338ca;
}
.octo-chip--indigo:hover { background: #e0e7ff; border-color: #a5b4fc; }

/* 空值 / 占位态 */
.octo-chip--empty {
  background: transparent;
  border-style: dashed;
  border-color: #cbd5e1;
  color: #94a3b8;
  cursor: default;
}
.octo-chip--empty.octo-chip--clickable {
  cursor: pointer;
}
.octo-chip--empty.octo-chip--clickable:hover {
  border-color: #818cf8;
  color: #6366f1;
  background: #f5f3ff;
}

.octo-sep {
  color: #cbd5e1;
  font-size: 11px;
  padding: 0 1px;
  flex-shrink: 0;
}

/* 琥珀色 chip（traceId） */
.octo-chip--amber {
  background: #fffbeb;
  border-color: #fcd34d;
  color: #92400e;
}
.octo-chip--amber:hover { background: #fef3c7; border-color: #f59e0b; }


/* 泳道 badge（内联于右侧元信息区） */
.octo-swim-badge {
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
.octo-swim-badge:hover { background: #e0e7ff; border-color: #a5b4fc; }
.octo-swim-badge--empty {
  border-style: dashed;
  border-color: #e2e8f0;
  background: transparent;
  color: #94a3b8;
}
.octo-swim-badge--empty .octo-swim-badge__dot { background: #cbd5e1; }
.octo-swim-badge__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #818cf8;
  flex-shrink: 0;
}

/* 内联调用结果面板 */
.invoke-result {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
}
.invoke-result__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.invoke-result__left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.invoke-result__right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.invoke-result__badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
  flex-shrink: 0;
}
.invoke-result__badge--success { background: #d1fae5; color: #065f46; }
.invoke-result__badge--fail    { background: #fee2e2; color: #991b1b; }
.invoke-result__badge--error   { background: #fee2e2; color: #991b1b; }
.invoke-result__code {
  font-size: 11px;
  font-family: monospace;
  color: #94a3b8;
  flex-shrink: 0;
}
.invoke-result__ms {
  font-size: 11px;
  color: #cbd5e1;
  flex-shrink: 0;
}
.invoke-result__msg {
  font-size: 11px;
  color: #94a3b8;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.invoke-result__error {
  padding: 12px;
  font-size: 12px;
  color: #dc2626;
  background: #fff5f5;
}

/* ─── 方法选择器 ─────────────────────────────────────────────── */
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

/* 预设 badge（左侧 = 改租户，右侧箭头 = 折叠） */
.param-preset-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  border-radius: 8px;
  user-select: none;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid #a7f3d0;
}
.param-preset-badge--collapsed { background: #ecfdf5; color: #065f46; }
.param-preset-badge--open      { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }

.param-preset-badge__left {
  padding: 1px 6px 1px 7px;
  cursor: pointer;
  transition: background 0.1s;
}
.param-preset-badge__left:hover { background: rgba(0,0,0,0.05); }

.param-preset-badge__arrow {
  padding: 1px 5px 1px 4px;
  font-size: 9px;
  opacity: 0.7;
  cursor: pointer;
  border-left: 1px solid currentColor;
  opacity: 0.4;
  transition: opacity 0.1s, background 0.1s;
}
.param-preset-badge__arrow:hover { opacity: 0.8; background: rgba(0,0,0,0.05); }

.param-preset-collapsed {
  font-size: 11px;
  color: #94a3b8;
  padding: 6px 10px;
  background: #f8fafc;
  border: 1px dashed #e2e8f0;
  border-radius: 6px;
  font-style: italic;
}

/* ─── 收藏区（结果头部右侧） ──────────────────────────────────── */
.invoke-save-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
  flex-shrink: 0;
}
.invoke-save-btn:hover { background: #f1f5f9; border-color: #cbd5e1; color: #334155; }
.invoke-save-btn--saved {
  border-color: #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  cursor: default;
}
.invoke-save-btn--confirm {
  border-color: #e2e8f0;
  background: #f8fafc;
  color: #475569;
  padding: 0 8px;
}
.invoke-save-btn--confirm:hover { background: #e2e8f0; border-color: #cbd5e1; color: #1e293b; }
.invoke-save-btn--cancel {
  border-color: #e2e8f0;
  background: transparent;
  color: #94a3b8;
  padding: 0 7px;
}
.invoke-save-btn--cancel:hover { background: #f1f5f9; border-color: #cbd5e1; color: #64748b; }

/* inline 收藏备注输入框 */
.invoke-save-input {
  width: 160px;
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  color: #0f172a;
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.invoke-save-input:focus {
  border-color: #94a3b8;
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.12);
}
.invoke-save-input::placeholder { color: #94a3b8; }
</style>
