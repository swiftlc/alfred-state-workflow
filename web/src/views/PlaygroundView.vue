<template>
  <div class="flex flex-col overflow-hidden" style="height:100%">

    <!-- 顶栏 -->
    <div class="flex items-center justify-between mb-5 shrink-0">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">Playground</h1>
      <div class="flex items-center gap-2">
        <n-button size="small" @click="handleImport">导入</n-button>
        <input ref="importInputRef" type="file" accept=".json" class="hidden" @change="onImportFile" />
        <n-button type="primary" size="small" @click="handleCreate">+ 新建页面</n-button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!pages.length" class="flex-1 flex flex-col items-center justify-center text-slate-300 select-none">
      <div class="text-5xl mb-3">🎮</div>
      <div class="text-sm">还没有页面，点击右上角新建</div>
    </div>

    <!-- 页面列表 -->
    <div v-else class="flex-1 overflow-y-auto pr-1">
      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="page in pages"
          :key="page.id"
          class="group relative border border-slate-100 rounded-xl bg-white hover:border-indigo-200 hover:shadow-md transition-all overflow-hidden cursor-pointer"
          @click="handleEdit(page)"
        >
          <!-- 渐变缩略图（静态，不加载 iframe） -->
          <div
            class="h-32 relative overflow-hidden"
            :style="{ background: cardGradient(page.name) }"
          >
            <!-- 首字母装饰 -->
            <span
              class="absolute inset-0 flex items-center justify-center text-5xl font-black text-white select-none"
              style="opacity:0.15;letter-spacing:-2px"
            >{{ page.name.slice(0, 2) }}</span>

            <!-- Hover 遮罩 + CTA -->
            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors
                        flex items-center justify-center gap-2">
              <div class="opacity-0 group-hover:opacity-100 transition-all duration-150 flex items-center gap-2">
                <span class="bg-white/95 text-slate-700 rounded-full px-3 py-1.5 text-xs font-semibold
                             shadow-sm flex items-center gap-1.5">
                  <component :is="Code2" :size="11" />
                  编辑
                </span>
                <span
                  class="bg-white/95 text-slate-700 rounded-full px-3 py-1.5 text-xs font-semibold
                         shadow-sm flex items-center gap-1.5"
                  @click.stop="handlePlay(page)"
                >
                  <component :is="Play" :size="11" />
                  演示
                </span>
              </div>
            </div>
          </div>

          <!-- 信息 + 操作行 -->
          <div class="px-3 py-2 flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1" @click.stop>
              <InlineEdit
                :value="page.name"
                placeholder="页面名称"
                display-style="font-size:13px;font-weight:500;color:#374151"
                input-style="font-size:13px;font-weight:500;color:#374151"
                @confirm="(name) => renamePage(page.id, name)"
              />
              <div class="text-[10px] text-slate-300 mt-0.5">{{ formatTime(page.updatedAt) }}</div>
            </div>

            <!-- 固定操作按钮 -->
            <div class="flex items-center gap-0.5 shrink-0" @click.stop>
              <n-button size="tiny" ghost title="导出 JSON" @click="handleExport(page)">
                <template #icon><component :is="Download" :size="11" /></template>
              </n-button>
              <n-button size="tiny" ghost type="error" title="删除" @click="handleDelete(page.id)">
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
        <!-- Play 顶栏（与 EditorView 统一风格） -->
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
            <component :is="ChevronLeft" :size="14" />
            返回
          </button>
          <div class="w-px h-4 bg-slate-100 shrink-0" />
          <span class="text-[13px] font-semibold text-slate-700 truncate">{{ playing.name }}</span>
          <div class="flex-1" />
          <div class="flex items-center gap-1.5">
            <n-button size="small" ghost @click="handleEdit(playing)">
              <template #icon><component :is="Code2" :size="13" /></template>
              编辑
            </n-button>
            <n-button size="small" ghost title="重载" @click="reloadKey++">
              <template #icon><component :is="RotateCcw" :size="13" /></template>
            </n-button>
          </div>
        </div>
        <!-- iframe 全屏 -->
        <div class="flex-1 min-h-0">
          <PlaygroundIframe :key="reloadKey" :html="playing.html" class="w-full h-full" />
        </div>
      </div>
    </teleport>

    <!-- ── 新建弹窗（极简，只需名称） ── -->
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

import { ref, reactive, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NModal, NInput, useDialog, useMessage } from 'naive-ui'
import { Play, Code2, Download, Trash2, RotateCcw, ChevronLeft } from '@lucide/vue'
import { usePlayground } from '@/composables/usePlayground'
import { formatTime } from '@/utils/search'
import type { PlaygroundPage } from '@/types/playground'
import PlaygroundIframe from '@/components/playground/PlaygroundIframe.vue'
import InlineEdit       from '@/components/InlineEdit.vue'

const router = useRouter()
const { pages, createPage, deletePage, renamePage, importPage } = usePlayground()
const dialog  = useDialog()
const message = useMessage()

// ── 卡片渐变色（根据页面名 hash 生成，稳定不变） ──────────────────────────────
const PALETTES = [
  ['#6366f1', '#8b5cf6'],
  ['#3b82f6', '#06b6d4'],
  ['#10b981', '#6366f1'],
  ['#f59e0b', '#ef4444'],
  ['#8b5cf6', '#ec4899'],
  ['#06b6d4', '#10b981'],
  ['#ef4444', '#f97316'],
  ['#ec4899', '#8b5cf6'],
]

function cardGradient(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const [a, b] = PALETTES[h % PALETTES.length]
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`
}

// ── 全屏 Play ──────────────────────────────────────────────────────────────────
const playing   = ref<PlaygroundPage | null>(null)
const reloadKey = ref(0)

function handlePlay(page: PlaygroundPage) {
  playing.value = page
  reloadKey.value++
}

// ── 进编辑器 ──────────────────────────────────────────────────────────────────
function handleEdit(page: PlaygroundPage) {
  router.push(`/playground/${page.id}`)
}

// ── 新建 ──────────────────────────────────────────────────────────────────────
const createModal    = reactive({ show: false, name: '' })
const createNameRef  = ref<InstanceType<typeof NInput> | null>(null)

function handleCreate() {
  createModal.name = ''
  createModal.show = true
  nextTick(() => (createNameRef.value as any)?.focus?.())
}

function confirmCreate() {
  const name = createModal.name.trim() || `页面 ${pages.value.length + 1}`
  const page = createPage(name, EMPTY_HTML(name))
  createModal.show = false
  handleEdit(page)
}

// ── 删除 ──────────────────────────────────────────────────────────────────────
function handleDelete(id: string) {
  dialog.warning({
    title:        '删除页面',
    content:      '确认删除？此操作不可撤销。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      deletePage(id)
      if (playing.value?.id === id) playing.value = null
    },
  })
}

// ── 导出 ──────────────────────────────────────────────────────────────────────
function handleExport(page: PlaygroundPage) {
  const blob = new Blob([JSON.stringify(page, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: `${page.name}.playground.json` }).click()
  URL.revokeObjectURL(url)
}

// ── 导入 ──────────────────────────────────────────────────────────────────────
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
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen p-6">
  <h1 class="text-xl font-bold text-slate-800 mb-4">${name}</h1>
  <p class="text-slate-400 text-sm">在编辑器中修改此页面。可通过 <code class="bg-slate-100 px-1 rounded font-mono">await $sql(query)</code> 查询数据库。</p>

  <script>
  (async () => {
    // const rows = await $sql('SELECT 1 as id, "hello" as name')
    // console.log(rows)
  })()
  <\/script>
</body>
</html>`
}
</script>
