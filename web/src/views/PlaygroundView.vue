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
          class="group relative border border-slate-100 rounded-xl bg-white hover:border-indigo-200 hover:shadow-sm transition-all overflow-hidden"
        >
          <!-- 预览区：点击进入 Play -->
          <div
            class="h-36 bg-slate-50 border-b border-slate-100 overflow-hidden cursor-pointer relative"
            @click="handlePlay(page)"
          >
            <PlaygroundIframe :html="page.html" class="pointer-events-none scale-50 origin-top-left" style="width:200%;height:200%" />
            <!-- 悬浮播放提示 -->
            <div class="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/10 flex items-center justify-center transition-colors">
              <div class="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full px-4 py-1.5 text-xs font-medium text-indigo-600 shadow-sm flex items-center gap-1.5">
                <Play :size="12" />
                演示
              </div>
            </div>
          </div>

          <!-- 信息区 -->
          <div class="px-3 py-2.5">
            <div style="height:20px;line-height:20px;overflow:hidden" @click.stop>
              <InlineEdit
                :value="page.name"
                placeholder="页面名称"
                display-style="font-size:13px;font-weight:500;color:#374151"
                input-style="font-size:13px;font-weight:500;color:#374151"
                @confirm="(name) => renamePage(page.id, name)"
              />
            </div>
            <div class="text-[10px] text-slate-300 mt-1">{{ formatTime(page.updatedAt) }}</div>
          </div>

          <!-- 操作按钮 -->
          <div class="absolute top-2 right-2 hidden group-hover:flex gap-1 z-10">
            <n-button size="tiny" ghost @click.stop="handlePlay(page)" title="全屏演示">
              <template #icon><Play :size="11" /></template>
            </n-button>
            <n-button size="tiny" ghost @click.stop="handleEdit(page)" title="编辑源码">
              <template #icon><Code2 :size="11" /></template>
            </n-button>
            <n-button size="tiny" ghost @click.stop="handleExport(page)" title="导出 JSON">
              <template #icon><Download :size="11" /></template>
            </n-button>
            <n-button size="tiny" ghost @click.stop="handleDelete(page.id)" title="删除">
              <template #icon><Trash2 :size="11" /></template>
            </n-button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 全屏 Play 模式 ── -->
    <teleport to="body">
      <div
        v-if="playing"
        class="fixed inset-0 z-50 bg-white flex flex-col"
      >
        <!-- Play 顶栏 -->
        <div class="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-white shrink-0">
          <n-button size="small" ghost @click="playing = null">← 退出</n-button>
          <span class="text-sm font-medium text-slate-700">{{ playing.name }}</span>
          <div class="ml-auto flex items-center gap-2">
            <n-button size="small" ghost @click="handleEdit(playing)">
              <template #icon><Code2 :size="13" /></template>
              源码
            </n-button>
            <n-button size="small" ghost @click="reloadKey++">
              <template #icon><RotateCcw :size="13" /></template>
              重载
            </n-button>
          </div>
        </div>
        <!-- iframe 占满剩余空间 -->
        <div class="flex-1 min-h-0">
          <PlaygroundIframe :key="reloadKey" :html="playing.html" class="w-full h-full" />
        </div>
      </div>
    </teleport>

    <!-- ── 新建弹窗 ── -->
    <n-modal
      v-model:show="createModal.show"
      preset="dialog"
      title="新建页面"
      style="width:480px"
      positive-text="创建空页面"
      negative-text="取消"
      @positive-click="confirmCreate"
      @negative-click="createModal.show = false"
    >
      <div class="pt-3 flex flex-col gap-3">
        <n-input v-model:value="createModal.name" placeholder="页面名称…" @keydown.enter="confirmCreate" />
        <n-input
          v-model:value="createModal.prompt"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          placeholder="需求描述（可选，用于后续 AI 生成）…"
        />
      </div>
    </n-modal>

  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'PlaygroundView' })

import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NModal, NInput, useDialog, useMessage } from 'naive-ui'
import { Play, Code2, Download, Trash2, RotateCcw } from '@lucide/vue'
import { usePlayground } from '@/composables/usePlayground'
import { formatTime } from '@/utils/search'
import type { PlaygroundPage } from '@/types/playground'
import PlaygroundIframe from '@/components/playground/PlaygroundIframe.vue'
import InlineEdit       from '@/components/InlineEdit.vue'

const router = useRouter()
const { pages, createPage, deletePage, renamePage, importPage } = usePlayground()
const dialog  = useDialog()
const message = useMessage()

// ── 全屏 Play ──────────────────────────────────────────────────────────────────
const playing   = ref<PlaygroundPage | null>(null)
const reloadKey = ref(0)

function handlePlay(page: PlaygroundPage) {
  playing.value = page
  reloadKey.value++
}

// ── 编辑源码 ───────────────────────────────────────────────────────────────────
function handleEdit(page: PlaygroundPage) {
  router.push(`/playground/${page.id}`)
}

// ── 新建 ───────────────────────────────────────────────────────────────────────
const createModal = reactive({ show: false, name: '', prompt: '' })

function handleCreate() {
  createModal.name   = ''
  createModal.prompt = ''
  createModal.show   = true
}

function confirmCreate() {
  const name = createModal.name.trim() || `页面 ${pages.value.length + 1}`
  const page = createPage(name, EMPTY_HTML(name), createModal.prompt)
  createModal.show = false
  // 新建后直接进编辑
  handleEdit(page)
}

// ── 删除 ───────────────────────────────────────────────────────────────────────
function handleDelete(id: string) {
  dialog.warning({
    title: '删除页面',
    content: '确认删除？此操作不可撤销。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      deletePage(id)
      if (playing.value?.id === id) playing.value = null
    },
  })
}

// ── 导出 ───────────────────────────────────────────────────────────────────────
function handleExport(page: PlaygroundPage) {
  const blob = new Blob([JSON.stringify(page, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `${page.name}.playground.json` })
  a.click()
  URL.revokeObjectURL(url)
}

// ── 导入 ───────────────────────────────────────────────────────────────────────
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
      const p = importPage(raw)
      message.success(`已导入「${p.name}」`)
    } catch { message.error('文件解析失败') }
    finally { if (importInputRef.value) importInputRef.value.value = '' }
  }
  reader.readAsText(file)
}

// ── 空页面模板 ─────────────────────────────────────────────────────────────────
function EMPTY_HTML(name: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  </style>
</head>
<body class="p-6 bg-gray-50 min-h-screen">
  <h1 class="text-2xl font-bold text-slate-800 mb-4">${name}</h1>
  <p class="text-slate-500">在编辑器中修改此页面，可通过 <code class="bg-slate-100 px-1 rounded">$sql(query)</code> 查询数据库。</p>

  <script>
    // 示例：查询数据
    // const rows = await $sql('SELECT 1 as id, "hello" as name')
    // document.getElementById('result').textContent = JSON.stringify(rows)
  <\/script>
</body>
</html>`
}
</script>
