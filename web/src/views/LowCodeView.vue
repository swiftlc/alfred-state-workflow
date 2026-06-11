<template>
  <div class="flex flex-col overflow-hidden" style="height: 100%">
    <div class="flex items-center justify-between mb-5 shrink-0">
      <h1 class="text-lg font-semibold text-slate-800 tracking-tight">低代码</h1>
      <n-button type="primary" size="small" @click="handleCreate">+ 新建页面</n-button>
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
          <div class="text-sm font-medium text-slate-700 mb-1 truncate">{{ page.name }}</div>
          <div class="text-xs text-slate-400">{{ page.widgets.length }} 个组件</div>
          <div class="text-[10px] text-slate-300 mt-2">{{ formatTime(page.updatedAt) }}</div>
          <div class="absolute top-3 right-3 hidden group-hover:flex gap-1">
            <button
              class="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
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
            <button class="text-slate-400 hover:text-slate-600" @click="editor.show = false">← 返回</button>
            <span class="font-medium text-slate-700">{{ editor.page?.name }}</span>
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

import { reactive } from 'vue'
import { NButton, NDrawer, NDrawerContent, useDialog } from 'naive-ui'
import { useLowCode } from '@/composables/useLowCode'
import { formatTime } from '@/utils/search'
import type { LowCodePage } from '@/types/lowcode'
import LowCodeEditor from '@/components/lowcode/LowCodeEditor.vue'

const { pages, createPage, deletePage, savePage } = useLowCode()
const dialog = useDialog()

const editor = reactive<{ show: boolean; page: LowCodePage | null; mode: 'edit' | 'preview' }>({
  show: false, page: null, mode: 'edit',
})

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

function handleDelete(id: string) {
  dialog.warning({
    title: '删除页面',
    content: '确认删除该页面？此操作不可撤销。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => deletePage(id),
  })
}
</script>
