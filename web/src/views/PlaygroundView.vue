<template>
  <div class="flex flex-col overflow-hidden" style="height:100%">

    <!-- 顶栏 -->
    <div class="flex items-center mb-4 shrink-0 gap-2">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">Playground</h1>

      <!-- ✦ 排序选择 -->
      <n-select
        v-model:value="sortBy"
        :options="sortOptions"
        size="small"
        style="width:110px"
        :consistent-menu-width="false"
      />

      <div class="flex-1" />

      <!-- ✦ 搜索触发按钮 -->
      <button
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
               border border-slate-200 bg-slate-50 hover:bg-white hover:border-indigo-300
               text-slate-400 text-[12px] transition-all cursor-pointer outline-none
               focus-visible:ring-2 focus-visible:ring-indigo-400"
        style="min-width:130px"
        @click="searchShow = true"
      >
        <component :is="Search" :size="12" class="shrink-0" />
        <span class="flex-1 text-left">搜索页面…</span>
        <kbd class="text-[10px] bg-white border border-slate-200 rounded px-1 py-0.5 leading-none text-slate-300 shrink-0">⌘K</kbd>
      </button>

      <!-- ✦ 导出全部 -->
      <n-button size="small" title="导出全部页面为 JSON" @click="exportAll">
        <template #icon><component :is="PackageOpen" :size="13" /></template>
        导出全部
      </n-button>

      <!-- ✦ 清空全部 -->
      <n-button size="small" type="error" ghost title="删除全部页面" @click="handleClearAll">
        <template #icon><component :is="Trash2" :size="13" /></template>
      </n-button>

      <n-button size="small" @click="handleImport">导入</n-button>
      <input ref="importInputRef" type="file" accept=".json" class="hidden" @change="onImportFile" />
      <n-button type="primary" size="small" @click="handleCreate">+ 新建页面</n-button>
    </div>

    <!-- ✦ 空状态：Lucide 图标 + 引导按钮 -->
    <div v-if="!pages.length" class="flex-1 flex flex-col items-center justify-center select-none">
      <component :is="Gamepad2" :size="48" class="text-slate-200 mb-4" />
      <p class="text-[13.5px] font-medium text-slate-400 mb-1">还没有 Playground 页面</p>
      <p class="text-xs text-slate-300 mb-5">创建页面来快速搭建数据查询、工具和可视化界面</p>
      <n-button type="primary" size="small" @click="handleCreate">创建第一个页面</n-button>
    </div>

    <!-- 页面列表 -->
    <div v-else class="flex-1 overflow-y-auto pr-1">
      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="page in sortedPages"
          :key="page.id"
          class="group relative border border-slate-200 rounded-xl bg-white
                 hover:border-indigo-300 hover:shadow-md
                 active:scale-[0.98] active:shadow-sm
                 transition-all duration-150 overflow-hidden cursor-pointer"
          @click="handleEdit(page)"
        >
          <!-- 渐变缩略图 -->
          <div
            class="h-32 relative overflow-hidden"
            :style="{ background: cardGradient(page.name) }"
          >
            <span
              class="absolute inset-0 flex items-center justify-center text-5xl font-black text-white select-none"
              style="opacity:0.15;letter-spacing:-2px"
            >{{ page.name.slice(0, 2) }}</span>

            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors
                        flex items-center justify-center gap-2">
              <div class="opacity-0 group-hover:opacity-100 transition-all duration-150 flex items-center gap-2">
                <span class="bg-white/95 text-slate-700 rounded-full px-3 py-1.5 text-xs font-semibold
                             shadow-sm flex items-center gap-1.5">
                  <component :is="Code2" :size="11" />编辑
                </span>
                <span
                  class="bg-white/95 text-slate-700 rounded-full px-3 py-1.5 text-xs font-semibold
                         shadow-sm flex items-center gap-1.5"
                  @click.stop="handlePlay(page)"
                >
                  <component :is="Play" :size="11" />演示
                </span>
              </div>
            </div>
          </div>

          <!-- 信息 + 操作 -->
          <div class="px-3 py-2 flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1" @click.stop>
              <InlineEdit
                :value="page.name"
                placeholder="页面名称"
                display-style="font-size:13px;font-weight:500;color:#374151"
                input-style="font-size:13px;font-weight:500;color:#374151"
                @confirm="(name) => renamePage(page.id, name)"
              />
              <!-- ✦ 时间 + tooltip 精确时间 -->
              <n-tooltip placement="bottom" :delay="400">
                <template #trigger>
                  <div class="text-[10px] text-slate-300 mt-0.5 w-fit cursor-default">
                    {{ formatTime(page.updatedAt) }}
                  </div>
                </template>
                {{ formatAbsTime(page.updatedAt) }}
              </n-tooltip>
            </div>

            <!-- ✦ 操作按钮：复制 + 导出 + 删除 -->
            <div class="flex items-center gap-1 shrink-0" @click.stop>
              <n-button size="tiny" ghost title="复制页面" @click="handleDuplicate(page.id)">
                <template #icon><component :is="Copy" :size="11" /></template>
              </n-button>
              <n-button size="tiny" ghost title="导出 JSON" @click="handleExport(page)">
                <template #icon><component :is="Download" :size="11" /></template>
              </n-button>
              <n-button
                size="tiny"
                ghost
                title="删除"
                class="delete-btn"
                @click="handleDelete(page.id)"
              >
                <template #icon><component :is="Trash2" :size="11" /></template>
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 全屏 Play 模式 ── -->
    <teleport to="body">
      <div v-if="playing" class="fixed inset-0 z-50 bg-white flex flex-col">
        <div
          class="flex items-center px-3 shrink-0 bg-white border-b border-slate-100"
          style="height:44px;gap:8px;box-shadow:0 1px 4px rgba(30,41,80,0.06)"
        >
          <button
            class="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg text-slate-400
                   hover:text-indigo-500 hover:bg-indigo-50 text-[12.5px] font-medium
                   transition-all cursor-pointer outline-none bg-transparent border-0"
            @click="playing = null"
          >
            <component :is="ChevronLeft" :size="14" />返回
          </button>
          <div class="w-px h-4 bg-slate-100 shrink-0" />
          <span class="text-[13px] font-semibold text-slate-700 truncate">{{ playing.name }}</span>
          <div class="flex-1" />
          <div class="flex items-center gap-1.5">
            <n-button size="small" ghost @click="handleEdit(playing)">
              <template #icon><component :is="Code2" :size="13" /></template>编辑
            </n-button>
            <n-button size="small" ghost title="重载" @click="reloadKey++">
              <template #icon><component :is="RotateCcw" :size="13" /></template>
            </n-button>
          </div>
        </div>
        <div class="flex-1 min-h-0">
          <PlaygroundIframe :key="reloadKey" :html="playing.html" class="w-full h-full" />
        </div>
      </div>
    </teleport>

    <!-- ── Cmd+K 搜索弹窗 ── -->
    <DictPicker
      v-model:show="searchShow"
      dict-key="playground"
      dict-name="Playground 页面"
      :items="pageItems"
      :allow-input="false"
      placeholder="搜索页面名称…"
      @select="onSearchSelect"
    >
      <template #item="{ item, isActive }">
        <!-- ✦ 渐变缩略图（inline styles，不依赖 DictPicker scoped CSS） -->
        <span
          :style="{
            width: '32px', height: '32px', borderRadius: '8px', flexShrink: '0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: cardGradient(item.name),
            fontSize: '12px', fontWeight: '700', letterSpacing: '-0.5px',
            color: 'rgba(255,255,255,0.85)',
          }"
        >{{ item.name.slice(0, 2) }}</span>

        <!-- ✦ 文字区（flex-col，name + time 各占一行） -->
        <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;">
          <span style="font-size:14px;font-weight:500;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            {{ item.name }}
          </span>
          <span v-if="item.description" style="font-size:11.5px;color:#94a3b8;white-space:nowrap;">
            {{ item.description }}
          </span>
        </span>

        <component :is="CornerDownLeft" v-if="isActive" :size="13" style="color:#c7d2fe;flex-shrink:0" />
      </template>
    </DictPicker>

    <!-- 新建弹窗 -->
    <n-modal
      v-model:show="createModal.show"
      preset="dialog"
      title="新建页面"
      style="width:400px"
      positive-text="创建"
      negative-text="取消"
      @positive-click="confirmCreate"
      @negative-click="createModal.show = false"
    >
      <n-input
        ref="createNameRef"
        v-model:value="createModal.name"
        placeholder="页面名称…"
        style="margin-top:12px"
        @keydown.enter="confirmCreate"
      />
    </n-modal>

  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'PlaygroundView' })

import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NModal, NInput, NTooltip, NSelect, useDialog, useMessage } from 'naive-ui'
import { Play, Code2, Download, Trash2, RotateCcw, ChevronLeft, Gamepad2, Search, CornerDownLeft, Copy, PackageOpen } from '@lucide/vue'
import { usePlayground } from '@/composables/usePlayground'
import { formatTime } from '@/utils/search'
import type { PlaygroundPage } from '@/types/playground'
import type { DictItem, ContextDataItem } from '@/types'
import PlaygroundIframe from '@/components/playground/PlaygroundIframe.vue'
import InlineEdit       from '@/components/InlineEdit.vue'
import DictPicker       from '@/components/DictPicker.vue'

const router = useRouter()
const { pages, createPage, deletePage, renamePage, importPage, duplicatePage, exportAll, clearAll } = usePlayground()
const dialog  = useDialog()
const message = useMessage()

// ── 排序 ──────────────────────────────────────────────────────────────────────
const sortBy = ref<'updatedAt' | 'createdAt'>('updatedAt')
const sortOptions = [
  { label: '最近修改', value: 'updatedAt' },
  { label: '最近创建', value: 'createdAt' },
]
const sortedPages = computed(() =>
  [...pages.value].sort((a, b) => b[sortBy.value] - a[sortBy.value])
)

// ── Cmd+K 搜索 ────────────────────────────────────────────────────────────────
const searchShow = ref(false)

const pageItems = computed((): DictItem[] =>
  pages.value.map(p => ({
    id:          p.id,
    name:        p.name,
    value:       p.id,
    description: formatTime(p.updatedAt),
    pinned:      false,
    lastUsedAt:  p.updatedAt,
  }))
)

function onSearchSelect(item: ContextDataItem) {
  const page = pages.value.find(p => p.id === item.id || p.id === item.value)
  if (page) handleEdit(page)
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchShow.value = true
  }
}
onMounted(()   => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// ── 渐变色 ────────────────────────────────────────────────────────────────────
// 专业配色：深色系，统一在 slate/indigo/blue 家族，不超过 5 个色组
const PALETTES = [
  ['#1e293b', '#334155'], // slate 深灰
  ['#1e3a5f', '#1d4ed8'], // 深海蓝
  ['#312e81', '#4338ca'], // 深靛蓝
  ['#0f172a', '#1e3a5f'], // 极深蓝黑
  ['#1e1b4b', '#3730a3'], // 深紫蓝
]
function cardGradient(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const [a, b] = PALETTES[h % PALETTES.length]
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`
}

// ── 时间格式 ──────────────────────────────────────────────────────────────────
function formatAbsTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── 全屏 Play ─────────────────────────────────────────────────────────────────
const playing   = ref<PlaygroundPage | null>(null)
const reloadKey = ref(0)
function handlePlay(page: PlaygroundPage) { playing.value = page; reloadKey.value++ }

// ── 编辑 ──────────────────────────────────────────────────────────────────────
function handleEdit(page: PlaygroundPage) { router.push(`/playground/${page.id}`) }

// ── 新建 ──────────────────────────────────────────────────────────────────────
const createModal   = reactive({ show: false, name: '' })
const createNameRef = ref<InstanceType<typeof NInput> | null>(null)

function handleCreate() {
  createModal.name = ''
  createModal.show = true
  nextTick(() => (createNameRef.value as any)?.focus?.())
}
function confirmCreate() {
  const name = createModal.name.trim() || `页面 ${pages.value.length + 1}`
  handleEdit(createPage(name, EMPTY_HTML(name)))
  createModal.show = false
}

// ── 清空全部 ──────────────────────────────────────────────────────────────────
function handleClearAll() {
  dialog.warning({
    title:        '清空全部页面',
    content:      `将删除全部 ${pages.value.length} 个页面，此操作不可撤销。`,
    positiveText: '确认清空',
    negativeText: '取消',
    onPositiveClick: () => { clearAll(); message.success('已清空全部页面') },
  })
}

// ── 复制 ──────────────────────────────────────────────────────────────────────
function handleDuplicate(id: string) {
  const copy = duplicatePage(id)
  if (copy) message.success(`已复制为「${copy.name}」`)
}

// ── 删除 ──────────────────────────────────────────────────────────────────────
function handleDelete(id: string) {
  dialog.warning({
    title: '删除页面', content: '确认删除？此操作不可撤销。',
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: () => {
      deletePage(id)
      if (playing.value?.id === id) playing.value = null
    },
  })
}

// ── 导出 / 导入 ───────────────────────────────────────────────────────────────
function handleExport(page: PlaygroundPage) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(page, null, 2)], { type: 'application/json' }))
  Object.assign(document.createElement('a'), { href: url, download: `${page.name}.playground.json` }).click()
  URL.revokeObjectURL(url)
}

const importInputRef = ref<HTMLInputElement | null>(null)
function handleImport() { importInputRef.value?.click() }
function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const raw = JSON.parse(ev.target?.result as string) as PlaygroundPage
      if (!raw.name || typeof raw.html !== 'string') { message.error('无效的 Playground 文件'); return }
      message.success(`已导入「${importPage(raw).name}」`)
    } catch { message.error('文件解析失败') }
    finally { if (importInputRef.value) importInputRef.value.value = '' }
  }
  reader.readAsText(file)
}

// ── 空页面模板 ────────────────────────────────────────────────────────────────
function EMPTY_HTML(name: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; }<\/style>
</head>
<body class="bg-gray-50 min-h-screen p-6">
  <h1 class="text-xl font-bold text-slate-800 mb-4">${name}</h1>
  <p class="text-slate-400 text-sm">通过 <code class="bg-slate-100 px-1 rounded font-mono">await $sql(query)</code> 查询数据库。</p>
  <script>
  (async () => {
    // const rows = await $sql('SELECT 1 as id, "hello" as name')
  })()
  <\/script>
</body>
</html>`
}
</script>

<style scoped>
/* ✦ 删除按钮 hover 变红 */
:deep(.delete-btn:hover .n-icon) { color: #ef4444 !important }
:deep(.delete-btn:hover) { border-color: #fca5a5 !important; color: #ef4444 !important }
</style>
