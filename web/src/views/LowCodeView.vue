<template>
  <div class="flex flex-col overflow-hidden" style="height: 100%">
    <div class="flex items-center justify-between mb-5 shrink-0">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">低代码</h1>
      <div class="flex items-center gap-2">
        <!-- 导入 -->
        <n-button size="small" @click="handleImport">导入</n-button>
        <input ref="importInputRef" type="file" accept=".json" class="hidden" @change="onImportFile" />
        <!-- 新建 -->
        <n-button type="primary" size="small" @click="handleCreate">+ 新建页面</n-button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!pages.length" class="flex-1 flex flex-col items-center justify-center text-slate-300 select-none">
      <div class="text-5xl mb-3">🧩</div>
      <div class="text-sm">还没有页面，点击右上角新建</div>
    </div>

    <!-- 页面列表 -->
    <div v-else class="flex-1 overflow-y-auto">
      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="page in pages"
          :key="page.id"
          class="group relative border border-slate-100 rounded-xl p-4 bg-white hover:border-indigo-200 hover:shadow-sm cursor-pointer transition-all"
          @click="openPage(page)"
        >
          <!-- 页面名：InlineEdit 改名 -->
          <div class="text-sm font-medium text-slate-700 mb-1" @click.stop>
            <InlineEdit
              :value="page.name"
              placeholder="页面名称"
              display-style="font-size:14px;font-weight:500;color:#374151;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block"
              input-style="font-size:14px;font-weight:500;color:#374151;max-width:180px"
              @confirm="(name) => renamePage(page.id, name)"
            />
          </div>
          <div class="text-xs text-slate-400">{{ page.widgets.length }} 个组件</div>
          <div class="text-[10px] text-slate-300 mt-2">{{ formatTime(page.updatedAt) }}</div>

          <!-- hover 操作 -->
          <div class="absolute top-3 right-3 hidden group-hover:flex gap-1">
            <button
              class="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
              title="导出 JSON"
              @click.stop="handleExport(page)"
            >↓</button>
            <button
              class="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="删除"
              @click.stop="handleDelete(page.id)"
            >✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑器抽屉 -->
    <n-drawer v-model:show="editor.show" :width="'100%'" placement="right">
      <n-drawer-content :native-scrollbar="false" :closable="false">
        <template #header>
          <div class="flex items-center gap-3 w-full">
            <button class="text-slate-400 hover:text-slate-600 flex-shrink-0" @click="editor.show = false">← 返回</button>
            <!-- 标题也支持 InlineEdit 改名 -->
            <div @click.stop>
              <InlineEdit
                v-if="editor.page"
                :value="editor.page.name"
                placeholder="页面名称"
                display-style="font-size:14px;font-weight:500;color:#374151"
                input-style="font-size:14px;font-weight:500;color:#374151"
                @confirm="(name) => handleRenameInEditor(name)"
              />
            </div>
            <div class="ml-auto flex items-center gap-2">
              <n-button size="small" :type="editor.mode === 'edit' ? 'primary' : 'default'" @click="editor.mode = 'edit'">编辑</n-button>
              <n-button size="small" :type="editor.mode === 'preview' ? 'primary' : 'default'" @click="editor.mode = 'preview'">预览</n-button>
            </div>
          </div>
        </template>
        <LowCodeEditor v-if="editor.page" :page="editor.page" :mode="editor.mode" @save="handleSave" />
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'LowCodeView' })

import { ref, reactive } from 'vue'
import { NButton, NDrawer, NDrawerContent, useDialog, useMessage } from 'naive-ui'
import { useLowCode } from '@/composables/useLowCode'
import { formatTime } from '@/utils/search'
import type { LowCodePage } from '@/types/lowcode'
import LowCodeEditor from '@/components/lowcode/LowCodeEditor.vue'
import InlineEdit from '@/components/InlineEdit.vue'

const { pages, createPage, importPage, deletePage, savePage, renamePage } = useLowCode()
const dialog  = useDialog()
const message = useMessage()

const editor = reactive<{ show: boolean; page: LowCodePage | null; mode: 'edit' | 'preview' }>({
  show: false, page: null, mode: 'edit',
})

// ─── 页面操作 ──────────────────────────────────────────────────────────────────

function handleCreate() {
  const page = createPage('新页面 ' + (pages.value.length + 1))
  openPage(page)
}

function openPage(page: LowCodePage) {
  editor.page = { ...page, widgets: [...page.widgets] }
  editor.mode = 'edit'
  editor.show = true
}

function handleSave(page: LowCodePage) {
  savePage(page)
  editor.page = { ...page }
}

function handleRenameInEditor(name: string) {
  if (!editor.page || !name.trim()) return
  editor.page.name = name
  renamePage(editor.page.id, name)
}

function handleDelete(id: string) {
  dialog.warning({
    title: '删除页面',
    content: '确认删除该页面？此操作不可撤销。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => deletePage(id),
  })
}

// ─── 导出 ──────────────────────────────────────────────────────────────────────

function handleExport(page: LowCodePage) {
  const json = JSON.stringify(page, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${page.name}.lowcode.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── 导入 ──────────────────────────────────────────────────────────────────────

const importInputRef = ref<HTMLInputElement | null>(null)

function handleImport() {
  importInputRef.value?.click()
}

function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const raw  = JSON.parse(ev.target?.result as string) as LowCodePage
      // 校验基本结构
      if (!raw.id || !raw.name || !Array.isArray(raw.widgets)) {
        message.error('无效的页面配置文件')
        return
      }
      const imported = importPage({ ...raw, name: raw.name + '（导入）' })
      message.success(`已导入「${imported.name}」`)
    } catch {
      message.error('文件解析失败，请确认是有效的 JSON')
    } finally {
      // 重置 input，允许重复导入同一文件
      if (importInputRef.value) importInputRef.value.value = ''
    }
  }
  reader.readAsText(file)
}
</script>
