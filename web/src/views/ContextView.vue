<template>
  <div>
    <!-- 页头 -->
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">当前上下文</h1>
      <div class="flex items-center gap-2">
        <n-button size="small" :loading="loading" @click="loadContext">
          <template #icon><component :is="RefreshCw" :size="13" /></template>
          刷新
        </n-button>
        <n-button size="small" :disabled="!context" @click="copyJson">
          <template #icon><component :is="Copy" :size="13" /></template>
          复制 JSON
        </n-button>
        <n-button size="small" :disabled="!context" @click="openSaveWorkspace">
          <template #icon><component :is="Layers" :size="13" /></template>
          保存为工作区
        </n-button>
        <n-button size="small" @click="openEdit">
          <template #icon><component :is="Pencil" :size="13" /></template>
          编辑 JSON
        </n-button>
        <n-button size="small" type="error" :disabled="!context" @click="doClear">清空</n-button>
      </div>
    </div>

    <!-- 状态 badge -->
    <div class="flex items-center gap-3 mb-5">
      <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">状态</span>
      <n-tag type="info" size="small" :bordered="false"
             style="font-family:monospace; font-weight:600; background:#eef2ff; color:#4f46e5">
        {{ context?.state || 'home' }}
      </n-tag>
    </div>

    <!-- 卡片网格 -->
    <div class="ctx-grid">
      <!-- 已有上下文项的卡片 -->
      <div
        v-for="key in contextKeys"
        :key="key"
        class="ctx-card ctx-card--filled"
        @click="openPickerFor(key)"
      >
        <div class="ctx-card__header">
          <span class="ctx-card__key">{{ dictNameOf(key) }}</span>
          <button class="ctx-card__remove" title="移除" @click.stop="removeKey(key)">
            <component :is="X" :size="11" />
          </button>
        </div>
        <div class="ctx-card__name">{{ context!.data[key].name }}</div>
        <div v-if="context!.data[key].value !== context!.data[key].name" class="ctx-card__value">
          {{ context!.data[key].value }}
        </div>
      </div>

      <!-- 添加新项卡片 -->
      <div class="ctx-card ctx-card--add" @click="openCategoryPicker">
        <component :is="Plus" :size="20" style="color:#c7d2fe" />
        <span class="ctx-card__add-label">添加</span>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && contextKeys.length === 0" class="flex flex-col items-center py-16 text-slate-400">
      <component :is="Inbox" :size="32" class="mb-3 opacity-40" />
      <p class="text-sm">暂无上下文数据</p>
      <p class="text-xs mt-1 opacity-60">点击右侧「添加」卡片或等待 Alfred 运行后自动填充</p>
    </div>

    <!-- ── 分类选择器 Modal (Alfred 风格) ── -->
    <n-modal v-model:show="catPicker.show" :mask-closable="true" :auto-focus="false">
      <div class="alfred-wrap" @keydown.esc="catPicker.show = false">
        <div class="alfred-search">
          <component :is="LayoutGrid" :size="18" style="color:#94a3b8; flex-shrink:0" />
          <span style="flex:1; font-size:17px; color:#94a3b8">选择字典分类</span>
          <kbd class="alfred-esc" @click="catPicker.show = false">esc</kbd>
        </div>
        <div class="alfred-list">
          <div v-if="catPicker.loading" class="alfred-empty"><n-spin size="small" /></div>
          <template v-else>
            <div
              v-for="d in availableDicts"
              :key="d.key"
              class="alfred-item"
              @click="pickCategory(d.key)"
            >
              <span class="alfred-item__icon">
                <component :is="Database" :size="15" />
              </span>
              <span class="alfred-item__body">
                <span class="alfred-item__name">{{ d.name }}</span>
                <span class="alfred-item__sub">{{ d.key }}</span>
              </span>
            </div>
            <div v-if="!availableDicts.length" class="alfred-empty">所有字典已在上下文中</div>
          </template>
        </div>
      </div>
    </n-modal>

    <!-- ── DictPicker ── -->
    <DictPicker
      v-model:show="picker.show"
      :dict-key="picker.key"
      :dict-name="dictNameOf(picker.key)"
      :fetch-items="picker.fetchItems"
      :current-value="context?.data[picker.key] ?? null"
      @select="onPickerSelect"
    />

    <!-- ── 编辑 JSON Modal ── -->
    <n-modal v-model:show="editModal.show" preset="dialog" title="编辑上下文 JSON"
             style="width:640px" positive-text="保存" negative-text="取消"
             @positive-click="submitEdit">
      <n-form style="margin-top:12px">
        <n-form-item :feedback="editModal.error" validation-status="error">
          <n-input v-model:value="editModal.json" type="textarea" :rows="16"
                   style="font-family:monospace; font-size:12px"
                   placeholder='{ "state": "home", "data": {} }'
                   @input="editModal.error = ''" />
        </n-form-item>
      </n-form>
    </n-modal>

    <!-- ── 保存工作区 Modal ── -->
    <n-modal v-model:show="workspaceModal.show" preset="dialog" title="保存为工作区"
             positive-text="保存" negative-text="取消"
             @positive-click="submitSaveWorkspace">
      <n-form style="margin-top:12px">
        <n-form-item label="工作区名称">
          <n-input v-model:value="workspaceModal.name" placeholder="请输入工作区名称" />
        </n-form-item>
        <div class="text-xs text-slate-400 mt-1">
          将保存当前 {{ contextKeys.length }} 个上下文项
        </div>
      </n-form>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { RefreshCw, Copy, Layers, Pencil, Inbox, X, Plus, LayoutGrid, Database } from '@lucide/vue'
import { NButton, NTag, NModal, NForm, NFormItem, NInput, NSpin, useMessage, useDialog } from 'naive-ui'
import { getContext, setContext, getDicts, getDictItems, createWorkspace } from '@/api/alfred'
import { READONLY_DICTS } from '@/config/dicts'
import DictPicker from '@/components/DictPicker.vue'
import type { Context, ContextDataItem, DictItem } from '@/types'

const message = useMessage()
const dialog  = useDialog()

const loading = ref(false)
const context = ref<Context | null>(null)

const contextKeys = computed(() =>
  context.value ? Object.keys(context.value.data) : []
)

// ─── 字典名称映射 ─────────────────────────────────────────────────────────────
const dictNameMap = ref<Record<string, string>>({})

READONLY_DICTS.forEach(d => { dictNameMap.value[d.key] = d.name })

function dictNameOf(key: string) {
  return dictNameMap.value[key] ?? key
}

// ─── 加载上下文 ───────────────────────────────────────────────────────────────
async function loadContext() {
  loading.value = true
  try { context.value = await getContext() }
  catch { message.error('获取上下文失败') }
  finally { loading.value = false }
}

// ─── 可用字典列表（分类选择器用） ─────────────────────────────────────────────
interface DictOption { key: string; name: string }
const allDicts = ref<DictOption[]>([])

const availableDicts = computed(() =>
  allDicts.value.filter(d => !contextKeys.value.includes(d.key))
)

async function ensureDicts() {
  if (allDicts.value.length) return
  const editableDicts = await getDicts()
  editableDicts.forEach(d => { dictNameMap.value[d.key] = d.name })
  allDicts.value = [
    ...READONLY_DICTS.map(d => ({ key: d.key, name: d.name })),
    ...editableDicts.map(d => ({ key: d.key, name: d.name })),
  ]
}

// ─── item 加载函数工厂 ────────────────────────────────────────────────────────
function makeFetchItems(key: string): () => Promise<DictItem[]> {
  const ro = READONLY_DICTS.find(d => d.key === key)
  if (ro) return ro.fetchItems
  return () => getDictItems(key)
}

// ─── 分类选择器 ───────────────────────────────────────────────────────────────
const catPicker = reactive({ show: false, loading: false })

async function openCategoryPicker() {
  catPicker.loading = true
  catPicker.show    = true
  await ensureDicts()
  catPicker.loading = false
}

function pickCategory(key: string) {
  catPicker.show = false
  openPickerFor(key)
}

// ─── 字典项选择器 ─────────────────────────────────────────────────────────────
const picker = reactive<{
  show: boolean
  key: string
  fetchItems: () => Promise<DictItem[]>
}>({
  show:       false,
  key:        '',
  fetchItems: () => Promise.resolve([]),
})

function openPickerFor(key: string) {
  picker.key        = key
  picker.fetchItems = makeFetchItems(key)
  picker.show       = true
}

async function onPickerSelect(item: ContextDataItem) {
  if (!context.value) context.value = { state: 'home', data: {} }
  context.value.data[picker.key] = item
  try {
    await setContext(context.value)
    message.success(`已更新 ${dictNameOf(picker.key)}`)
  } catch {
    message.error('保存失败')
  }
}

// ─── 移除 key ─────────────────────────────────────────────────────────────────
function removeKey(key: string) {
  if (!context.value) return
  const next: Context = {
    state: context.value.state,
    data:  { ...context.value.data },
  }
  delete next.data[key]
  dialog.warning({
    title:         '移除字典项',
    content:       `从上下文中移除「${dictNameOf(key)}」？`,
    positiveText:  '移除',
    negativeText:  '取消',
    onPositiveClick: async () => {
      await setContext(next)
      context.value = next
      message.success('已移除')
    },
  })
}

// ─── 复制 JSON ────────────────────────────────────────────────────────────────
function copyJson() {
  if (!context.value) return
  navigator.clipboard.writeText(JSON.stringify(context.value, null, 2))
  message.success('已复制到剪贴板')
}

// ─── 清空 ─────────────────────────────────────────────────────────────────────
function doClear() {
  dialog.warning({
    title:         '清空上下文',
    content:       '将重置 Alfred 上下文，确认？',
    positiveText:  '清空',
    negativeText:  '取消',
    onPositiveClick: async () => {
      await setContext({ state: 'home', data: {} })
      context.value = { state: 'home', data: {} }
      message.success('已清空')
    },
  })
}

// ─── 编辑 JSON Modal ──────────────────────────────────────────────────────────
const editModal = reactive({ show: false, json: '', error: '' })

function openEdit() {
  editModal.json  = JSON.stringify(context.value ?? { state: 'home', data: {} }, null, 2)
  editModal.error = ''
  editModal.show  = true
}

async function submitEdit() {
  try {
    const parsed = JSON.parse(editModal.json) as Context
    await setContext(parsed)
    context.value  = parsed
    message.success('已保存')
    return true
  } catch {
    editModal.error = 'JSON 格式错误，请检查后重试'
    return false
  }
}

// ─── 保存工作区 Modal ─────────────────────────────────────────────────────────
const workspaceModal = reactive({ show: false, name: '' })

function openSaveWorkspace() {
  workspaceModal.name = ''
  workspaceModal.show = true
}

async function submitSaveWorkspace() {
  if (!workspaceModal.name.trim()) { message.error('请输入工作区名称'); return false }
  if (!context.value) return false
  await createWorkspace(workspaceModal.name.trim(), context.value.data as Record<string, unknown>)
  message.success('已保存为工作区')
  return true
}

onMounted(loadContext)
</script>

<style scoped>
/* ── 卡片网格 ── */
.ctx-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ctx-card {
  position: relative;
  flex: 0 0 auto;
  width: 220px;
  min-height: 80px;
  border-radius: 10px;
  padding: 10px 12px 12px;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.1s;
  user-select: none;
  box-sizing: border-box;
}

.ctx-card--filled {
  background: #fff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.ctx-card--filled:hover {
  border-color: #a5b4fc;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.08);
  transform: translateY(-1px);
}

.ctx-card--add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 90px;
  border: 1.5px dashed #c7d2fe;
  background: transparent;
}
.ctx-card--add:hover {
  border-color: #818cf8;
  background: #f5f3ff;
}

/* ── 卡片内容 ── */
.ctx-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 6px;
}

.ctx-card__key {
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1.4;
}

.ctx-card__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s, background 0.1s;
  flex-shrink: 0;
  margin-top: -1px;
}
.ctx-card--filled:hover .ctx-card__remove { opacity: 1; }
.ctx-card__remove:hover { color: #ef4444; background: #fee2e2; }

.ctx-card__name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.4;
  word-break: break-all;
}

.ctx-card__value {
  font-family: monospace;
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
  line-height: 1.4;
  word-break: break-all;
}

.ctx-card__add-label {
  font-size: 12px;
  color: #a5b4fc;
  font-weight: 500;
}

/* ── Alfred 分类选择器 ── */
.alfred-wrap {
  width: 520px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06);
  overflow: hidden;
}

.alfred-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  height: 56px;
  border-bottom: 1px solid #f1f5f9;
}

.alfred-esc {
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  flex-shrink: 0;
}
.alfred-esc:hover { background: #e2e8f0; }

.alfred-list {
  max-height: 360px;
  overflow-y: auto;
  padding: 6px 0;
}

.alfred-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  cursor: pointer;
  transition: background 0.08s;
}
.alfred-item:hover { background: #4f46e5; }
.alfred-item:hover .alfred-item__name { color: #fff; }
.alfred-item:hover .alfred-item__sub  { color: rgba(255,255,255,0.65); }
.alfred-item:hover .alfred-item__icon { color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.15); }

.alfred-item__icon {
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

.alfred-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.alfred-item__name {
  font-size: 14px;
  font-weight: 500;
  color: #0f172a;
  line-height: 1.4;
}

.alfred-item__sub {
  font-family: monospace;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}

.alfred-empty {
  text-align: center;
  padding: 24px 0;
  color: #94a3b8;
  font-size: 13px;
}
</style>
